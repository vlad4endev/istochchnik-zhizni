/**
 * Интеграционный тест жизненного цикла звонков (реальный PostgreSQL + фейковый LiveKit RoomService).
 *
 * Запуск (пропускается без БД, чтобы не ломать `npm test` в CI):
 *   CALLS_IT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/istochik_db \
 *     npx ts-node --transpile-only src/services/callsLifecycle.integration.test.ts
 *
 * Схема БД должна быть создана заранее (однократный старт API → initDb).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

type Ev = { to: number; event: Record<string, unknown> };

const DB_URL = String(process.env.CALLS_IT_DATABASE_URL ?? '').trim();

/** In-process fake LiveKit RoomService: presence управляется тестом. */
function startFakeLiveKit(): Promise<{ url: string; rooms: Map<string, Set<string>>; close: () => void }> {
  const rooms = new Map<string, Set<string>>();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const b = (raw ? JSON.parse(raw) : {}) as Record<string, string>;
      const send = (obj: unknown, code = 200) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const op = /RoomService\/(\w+)/.exec(req.url ?? '')?.[1];
      switch (op) {
        case 'CreateRoom':
          if (!rooms.has(b.name)) rooms.set(b.name, new Set());
          return send({ name: b.name, sid: `RM_${b.name}` });
        case 'DeleteRoom':
          rooms.delete(b.room);
          return send({});
        case 'ListParticipants': {
          const set = rooms.get(b.room);
          if (!set) return send({ code: 'not_found', msg: 'room not found' }, 404);
          return send({ participants: [...set].map((identity) => ({ identity })) });
        }
        case 'RemoveParticipant':
          rooms.get(b.room)?.delete(b.identity);
          return send({});
        default:
          return send({ rooms: [] });
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, rooms, close: () => server.close() });
    });
  });
}

async function main(): Promise<void> {
  if (!DB_URL) {
    console.log('callsLifecycle.integration: skipped (CALLS_IT_DATABASE_URL not set)');
    return;
  }

  const lk = await startFakeLiveKit();
  process.env.DATABASE_URL = DB_URL;
  process.env.LIVEKIT_URL = lk.url;
  process.env.LIVEKIT_PUBLIC_URL = 'wss://lk.example.test';
  process.env.LIVEKIT_API_KEY = 'devkey';
  process.env.LIVEKIT_API_SECRET = 'secret_secret_secret_secret_secret_1234';
  process.env.CALLS_ENABLED = 'true';
  process.env.CALL_GHOST_GRACE_SEC = '60';
  process.env.CALL_GHOST_MISS_TICKS = '2';
  process.env.CALL_MAX_GROUP_PARTICIPANTS = '2';
  process.env.CALL_WEBHOOK_LEAVE_GRACE_SEC = '0';

  const { query, pool } = await import('../config/db');
  const hub = await import('../realtime/wsHub');
  const svc = await import('./callsService');
  const { livekitIdentityForMember, verifyLiveKitWebhook } = await import('./livekitService');
  const { AccessToken } = await import('livekit-server-sdk');
  const { createHash } = await import('node:crypto');
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const settings = await import('./callSettingsService');
  // Тест опирается на env-значения, а не на сохранённые в БД настройки админки.
  await query(`UPDATE global_settings SET call_settings_json = NULL WHERE id = 1`).catch(() => undefined);
  settings.invalidateCallSettingsCache();
  await settings.getCallRuntimeConfig();

  const events: Ev[] = [];
  (hub as unknown as { sendToMember: (id: number, e: unknown) => void }).sendToMember = (id, e) => {
    events.push({ to: id, event: e as Record<string, unknown> });
  };
  (hub as unknown as { sendToRoomAll: (c: string, e: unknown) => void }).sendToRoomAll = () => undefined;

  const evFor = (memberId: number, callId: string, type: string) =>
    events.filter((e) => e.to === memberId && e.event.callId === callId && e.event.type === type);

  const tag = `it_${Date.now()}`;
  const mkMember = async (n: string): Promise<number> => {
    const r = await query(
      `INSERT INTO members (name, first_name, app_role) VALUES ($1, $1, 'member') RETURNING id`,
      [`${tag}_${n}`],
    );
    return Number(r.rows[0].id);
  };
  const mkPrivate = async (a: number, b: number): Promise<string> => {
    const r = await query(`INSERT INTO conversations (type) VALUES ('private') RETURNING id`);
    const id = String(r.rows[0].id);
    await query(
      `INSERT INTO conversation_participants (conversation_id, member_id) VALUES ($1, $2), ($1, $3)`,
      [id, a, b],
    );
    return id;
  };
  const callRow = async (id: string) =>
    (await query(`SELECT status, end_reason, metadata FROM calls WHERE id = $1`, [id])).rows[0] as {
      status: string;
      end_reason: string | null;
      metadata: Record<string, unknown>;
    };
  const lastSystemMessage = async (convId: string, callId: string) =>
    (
      await query(
        `SELECT payload FROM messages WHERE conversation_id = $1 AND payload->>'call_id' = $2
         ORDER BY id DESC LIMIT 1`,
        [convId, callId],
      )
    ).rows[0] as { payload: Record<string, unknown> } | undefined;

  const mkGroup = async (ids: number[]): Promise<string> => {
    const r = await query(`INSERT INTO conversations (type) VALUES ('group') RETURNING id`);
    const id = String(r.rows[0].id);
    for (const m of ids) {
      await query(
        `INSERT INTO conversation_participants (conversation_id, member_id, role) VALUES ($1, $2, $3)`,
        [id, m, m === ids[0] ? 'owner' : 'member'],
      );
    }
    return id;
  };

  const alice = await mkMember('alice');
  const bob = await mkMember('bob');
  const carol = await mkMember('carol');
  const conv = await mkPrivate(alice, bob);
  await mkPrivate(alice, carol);
  const group = await mkGroup([alice, bob, carol]);

  const results: Array<{ name: string; ok: boolean; err?: string }> = [];
  const scenario = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, ok: true });
    } catch (e) {
      results.push({ name, ok: false, err: e instanceof Error ? e.message : String(e) });
    }
    // Каждый сценарий — с чистого листа: закрыть всё, что осталось активным.
    await query(
      `UPDATE calls SET status = 'ended', ended_at = NOW()
       WHERE status IN ('ringing','waiting','active')
         AND initiated_by = ANY($1::int[])`,
      [[alice, bob, carol]],
    );
  };

  const direct = () =>
    svc.createDirectCall({ initiatorId: alice, conversationId: conv, recipientId: bob, mediaType: 'audio' });

  await scenario('accept: другие устройства принявшего получают сигнал снять звонок', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    assert.equal(evFor(alice, c.id, 'call:accepted').length, 1, 'initiator gets call:accepted');
    assert.equal(
      evFor(bob, c.id, 'call:answered_elsewhere').length,
      1,
      'callee devices must get call:answered_elsewhere',
    );
  });

  await scenario('decline: другие устройства отклонившего перестают звонить', async () => {
    const c = await direct();
    await svc.declineCall(c.id, bob);
    assert.equal(evFor(alice, c.id, 'call:rejected').length, 1);
    assert.equal(evFor(bob, c.id, 'call:rejected').length, 1, 'callee devices must get call:rejected');
  });

  await scenario('end во время гудков инициатором = отмена (уведомить и записать в чат)', async () => {
    const c = await direct();
    await svc.endCall(c.id, alice);
    const row = await callRow(c.id);
    assert.equal(row.status, 'cancelled');
    assert.equal(evFor(bob, c.id, 'call:cancelled').length, 1, 'recipient must get call:cancelled');
    const msg = await lastSystemMessage(conv, c.id);
    assert.equal(msg?.payload.status, 'cancelled', 'history message «Вызов отменён»');
  });

  await scenario('end во время гудков получателем = отклонение', async () => {
    const c = await direct();
    await svc.endCall(c.id, bob);
    const row = await callRow(c.id);
    assert.equal(row.status, 'declined');
    assert.equal(evFor(alice, c.id, 'call:rejected').length, 1);
  });

  await scenario('собеседник пропал из LiveKit в личном звонке → звонок завершается', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    const room = `direct_${c.id.replace(/-/g, '')}`;
    lk.rooms.set(room, new Set([livekitIdentityForMember(alice)]));
    // Вышли за grace (60с): сдвигаем joined_at/started_at в прошлое.
    await query(
      `UPDATE call_participants SET joined_at = NOW() - INTERVAL '10 minutes' WHERE call_id = $1`,
      [c.id],
    );
    await query(`UPDATE calls SET started_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`, [c.id]);
    for (let i = 0; i < 3; i += 1) await svc.cleanupStaleCalls();
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended', `direct call must end when peer is gone (got ${row.status})`);
    assert.equal(row.end_reason, 'peer_lost');
    const ended = evFor(alice, c.id, 'call:ended');
    assert.equal(ended.length, 1, 'survivor gets call:ended');
    assert.equal(ended[0]?.event.reason, 'peer_lost');
    assert.equal(await svc.isMemberBusyInCall(alice), false, 'survivor is free again');
  });

  await scenario('инициатор без joined_at не считается «призраком» сразу после ответа', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    const room = `direct_${c.id.replace(/-/g, '')}`;
    // Инициатор ещё подключается к LiveKit (только что ответили) — в комнате пока только bob.
    lk.rooms.set(room, new Set([livekitIdentityForMember(bob)]));
    await query(
      `UPDATE call_participants SET joined_at = NULL WHERE call_id = $1 AND user_id = $2`,
      [c.id, alice],
    );
    for (let i = 0; i < 3; i += 1) await svc.cleanupStaleCalls();
    const row = await callRow(c.id);
    assert.equal(row.status, 'active', 'must stay active within grace period');
  });

  await scenario('без ответа → missed, обе стороны уведомлены', async () => {
    const c = await direct();
    await query(`UPDATE calls SET created_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`, [c.id]);
    await svc.cleanupStaleCalls();
    const row = await callRow(c.id);
    assert.equal(row.status, 'missed');
    assert.equal(evFor(alice, c.id, 'call:ended')[0]?.event.reason, 'no_answer');
    assert.equal(evFor(bob, c.id, 'call:ended')[0]?.event.reason, 'no_answer');
  });

  await scenario('занятость: второй вызов занятому абоненту отклоняется', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    await assert.rejects(
      svc.createDirectCall({ initiatorId: carol, conversationId: conv, recipientId: bob, mediaType: 'audio' }),
      (e: unknown) => e instanceof svc.CallsError && ['busy', 'forbidden'].includes(e.code),
    );
  });

  await scenario('гонка: два одновременных вызова не создают двойной звонок', async () => {
    const r = await Promise.allSettled([direct(), direct(), direct()]);
    const ok = r.filter((x) => x.status === 'fulfilled').length;
    assert.equal(ok, 1, `exactly one call created (got ${ok})`);
  });

  await scenario('отчёты качества от двух участников одновременно не теряются', async () => {
    for (let i = 0; i < 5; i += 1) {
      const c = await direct();
      await svc.acceptCall(c.id, bob);
      await Promise.all([
        svc.reportCallQuality(c.id, alice, { score: 5 }),
        svc.reportCallQuality(c.id, bob, { score: 1 }),
      ]);
      const row = await callRow(c.id);
      const q = (row.metadata.quality ?? {}) as { reports?: unknown[] };
      assert.equal(q.reports?.length, 2, `iteration ${i}: both reports kept`);
      await svc.endCall(c.id, alice);
    }
  });

  await scenario('завершение активного личного звонка: собеседник уведомлён, запись с длительностью', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    await svc.endCall(c.id, bob);
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended');
    assert.equal(evFor(alice, c.id, 'call:ended').length, 1);
    const msg = await lastSystemMessage(conv, c.id);
    assert.equal(msg?.payload.status, 'ended');
  });

  const groupCall = () =>
    svc.createGroupCall({ initiatorId: alice, conversationId: group, mediaType: 'audio' });

  await scenario('группа: выход хоста не завершает встречу, уход последнего — завершает', async () => {
    const c = await groupCall();
    await svc.issueCallToken(c.id, bob);
    await svc.endCall(c.id, alice);
    assert.equal((await callRow(c.id)).status, 'active', 'host leave keeps meeting alive');
    await svc.endCall(c.id, bob);
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended');
    assert.equal(row.end_reason, 'all_left');
  });

  await scenario('группа: «завершить для всех» доступно только модератору', async () => {
    const c = await groupCall();
    await svc.issueCallToken(c.id, bob);
    await svc.endCall(c.id, bob, { endForAll: true });
    assert.equal((await callRow(c.id)).status, 'active', 'non-moderator endForAll = leave');
    await svc.issueCallToken(c.id, bob);
    await svc.endCall(c.id, alice, { endForAll: true });
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended');
    assert.equal(row.end_reason, 'ended_by_moderator');
    assert.equal(evFor(bob, c.id, 'call:ended').length, 1);
  });

  await scenario('группа: лимит участников действует и при повторном входе', async () => {
    const c = await groupCall(); // alice joined (1/2)
    await svc.issueCallToken(c.id, bob); // 2/2
    await svc.endCall(c.id, bob); // bob left → 1/2
    await svc.issueCallToken(c.id, carol); // 2/2
    await assert.rejects(
      svc.issueCallToken(c.id, bob),
      (e: unknown) => e instanceof svc.CallsError && e.code === 'full',
      'rejoin over the limit must be rejected',
    );
  });

  await scenario('вебхук: собеседник ушёл из LiveKit → личный звонок завершается за секунды', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    const room = `direct_${c.id.replace(/-/g, '')}`;
    lk.rooms.set(room, new Set([livekitIdentityForMember(alice)])); // bob уже отключён
    const r = await svc.handleLiveKitWebhookEvent({
      event: 'participant_left',
      roomName: room,
      identity: livekitIdentityForMember(bob),
    });
    assert.equal(r, 'leave_scheduled');
    await sleep(300);
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended', 'ended without waiting for grace/cron');
    assert.equal(row.end_reason, 'peer_lost');
    assert.equal(evFor(alice, c.id, 'call:ended')[0]?.event.reason, 'peer_lost');
  });

  await scenario('вебхук: участник перезашёл до проверки → звонок продолжается', async () => {
    const c = await direct();
    await svc.acceptCall(c.id, bob);
    const room = `direct_${c.id.replace(/-/g, '')}`;
    // В LiveKit оба на месте (bob переподключился новым соединением).
    lk.rooms.set(room, new Set([livekitIdentityForMember(alice), livekitIdentityForMember(bob)]));
    await svc.handleLiveKitWebhookEvent({ event: 'participant_left', roomName: room, identity: livekitIdentityForMember(bob) });
    await sleep(300);
    assert.equal((await callRow(c.id)).status, 'active');
  });

  await scenario('вебхук: повторная доставка и чужие identity не ломают состояние', async () => {
    const c = await groupCall();
    await svc.issueCallToken(c.id, bob);
    const room = `group_${c.id.replace(/-/g, '')}`;
    lk.rooms.set(room, new Set([livekitIdentityForMember(alice)]));
    for (let i = 0; i < 3; i += 1) {
      await svc.handleLiveKitWebhookEvent({ event: 'participant_left', roomName: room, identity: livekitIdentityForMember(bob) });
    }
    assert.equal(
      await svc.handleLiveKitWebhookEvent({ event: 'participant_left', roomName: room, identity: 'EG_recorder' }),
      'ignored',
    );
    await sleep(300);
    const row = await callRow(c.id);
    assert.equal(row.status, 'active', 'group continues with the host');
    const parts = await query(
      `SELECT user_id, status FROM call_participants WHERE call_id = $1 ORDER BY user_id`,
      [c.id],
    );
    assert.deepEqual(
      parts.rows.map((p) => [Number(p.user_id), p.status]),
      [[alice, 'joined'], [bob, 'left']],
    );
  });

  await scenario('вебхук: room_finished закрывает «висящую» встречу', async () => {
    const c = await groupCall();
    const room = `group_${c.id.replace(/-/g, '')}`;
    lk.rooms.delete(room);
    assert.equal(await svc.handleLiveKitWebhookEvent({ event: 'room_finished', roomName: room }), 'room_finished');
    const row = await callRow(c.id);
    assert.equal(row.status, 'ended');
    assert.equal(await svc.isMemberBusyInCall(alice), false);
  });

  await scenario('вебхук: подпись проверяется (верная принимается, подделка — нет)', async () => {
    const body = JSON.stringify({
      event: 'participant_left',
      room: { name: 'direct_x' },
      participant: { identity: 'member:1' },
    });
    const sign = async (secret: string, payload: string) => {
      const at = new AccessToken('devkey', secret);
      at.sha256 = createHash('sha256').update(payload).digest('base64');
      return at.toJwt();
    };
    const ok = await verifyLiveKitWebhook(body, await sign('secret_secret_secret_secret_secret_1234', body));
    assert.deepEqual(ok, { event: 'participant_left', roomName: 'direct_x', identity: 'member:1' });
    await assert.rejects(verifyLiveKitWebhook(body, await sign('wrong_secret_wrong_secret_wrong_1234', body)));
    await assert.rejects(
      verifyLiveKitWebhook(body.replace('member:1', 'member:2'), await sign('secret_secret_secret_secret_secret_1234', body)),
      'tampered body must be rejected',
    );
    await assert.rejects(verifyLiveKitWebhook(body, undefined));
  });

  await scenario('cron: параллельные тики не выполняют очистку дважды', async () => {
    const r = await Promise.all([svc.cleanupStaleCalls(), svc.cleanupStaleCalls(), svc.cleanupStaleCalls()]);
    const ran = r.filter((x) => !x.skipped).length;
    assert.ok(ran >= 1, 'at least one tick ran');
    assert.ok(r.some((x) => x.skipped), 'overlapping ticks are skipped');
  });

  // cleanup test data
  await query(`DELETE FROM calls WHERE initiated_by = ANY($1::int[])`, [[alice, bob, carol]]);
  await query(
    `DELETE FROM messages WHERE conversation_id IN
       (SELECT conversation_id FROM conversation_participants WHERE member_id = ANY($1::int[]))`,
    [[alice, bob, carol]],
  );
  await query(
    `DELETE FROM conversations WHERE id IN
       (SELECT conversation_id FROM conversation_participants WHERE member_id = ANY($1::int[]))`,
    [[alice, bob, carol]],
  );
  await query(`DELETE FROM members WHERE id = ANY($1::int[])`, [[alice, bob, carol]]);

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.err ? `\n      → ${r.err}` : ''}`);
  lk.close();
  await pool?.end();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`callsLifecycle.integration: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
