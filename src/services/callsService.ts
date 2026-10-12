import { createHash, randomBytes, randomUUID } from 'crypto';

import { pool, query } from '../config/db';
import { encryptMessageText } from '../lib/messageCrypto';
import type { WsMessengerEvent } from '../types/messenger';
import {
  getConversationMemberIds,
  getConversationMeta,
  getConversationType,
  isMemberInConversation,
} from './messengerService';
import { sendPushNotification } from './pushService';
import {
  endLiveKitRoom,
  ensureLiveKitRoom,
  isLiveKitConfigured,
  livekitIdentityForMember,
  mintLiveKitJoinToken,
  removeLiveKitParticipant,
} from './livekitService';

export type CallType = 'direct' | 'group';
export type CallMediaType = 'audio' | 'video';
export type CallStatus =
  | 'ringing'
  | 'waiting'
  | 'active'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'failed';
export type CallAccessMode = 'closed' | 'link';
export type CallParticipantRole = 'initiator' | 'participant' | 'moderator';
export type CallParticipantStatus =
  | 'invited'
  | 'ringing'
  | 'joined'
  | 'left'
  | 'declined'
  | 'missed'
  | 'busy';

export type CallRow = {
  id: string;
  type: CallType;
  media_type: CallMediaType;
  status: CallStatus;
  conversation_id: string;
  livekit_room_name: string;
  initiated_by: number;
  access_mode: CallAccessMode;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
  metadata: Record<string, unknown>;
};

export type CallParticipantRow = {
  id: string;
  call_id: string;
  user_id: number;
  role: CallParticipantRole;
  status: CallParticipantStatus;
  invited_at: string;
  joined_at: string | null;
  left_at: string | null;
};

export type CallPublic = {
  id: string;
  type: CallType;
  mediaType: CallMediaType;
  status: CallStatus;
  conversationId: string;
  initiatedBy: number;
  accessMode: CallAccessMode;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: string | null;
  inviteUrl?: string | null;
  participants?: Array<{
    userId: number;
    role: CallParticipantRole;
    status: CallParticipantStatus;
    name?: string;
    avatarUrl?: string | null;
  }>;
};

export class CallsError extends Error {
  constructor(
    public code:
      | 'forbidden'
      | 'not_found'
      | 'busy'
      | 'already_in_call'
      | 'invalid'
      | 'conflict'
      | 'livekit_unavailable'
      | 'invite_invalid'
      | 'invite_expired'
      | 'invite_revoked'
      | 'full'
      | 'disabled',
    message: string,
  ) {
    super(message);
    this.name = 'CallsError';
  }
}

type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

function isCallsEnabled(): boolean {
  return process.env.CALLS_ENABLED === 'true';
}

function ringTimeoutSec(): number {
  return Math.max(15, Math.min(180, Number(process.env.CALL_RING_TIMEOUT_SEC ?? 60) || 60));
}

function inviteTtlHours(): number {
  return Math.max(1, Math.min(168, Number(process.env.CALL_INVITE_TTL_HOURS ?? 24) || 24));
}

function maxGroupParticipants(): number {
  return Math.max(2, Math.min(200, Number(process.env.CALL_MAX_GROUP_PARTICIPANTS ?? 50) || 50));
}

function publicWebOrigin(): string {
  const o = String(process.env.PUBLIC_WEB_ORIGIN ?? process.env.VITE_PWA_ORIGIN ?? '').trim();
  return o.replace(/\/$/, '');
}

function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function mapCallRow(row: Record<string, unknown>): CallRow {
  const meta = row.metadata;
  return {
    id: String(row.id),
    type: row.type as CallType,
    media_type: row.media_type as CallMediaType,
    status: row.status as CallStatus,
    conversation_id: String(row.conversation_id),
    livekit_room_name: String(row.livekit_room_name),
    initiated_by: Number(row.initiated_by),
    access_mode: (row.access_mode as CallAccessMode) || 'closed',
    created_at: new Date(String(row.created_at)).toISOString(),
    started_at: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    ended_at: row.ended_at ? new Date(String(row.ended_at)).toISOString() : null,
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    end_reason: row.end_reason != null ? String(row.end_reason) : null,
    metadata:
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
  };
}

async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('DATABASE_URL is not defined');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function sendWs(memberId: number, event: WsMessengerEvent): Promise<void> {
  try {
    const { sendToMember } = await import('../realtime/wsHub');
    sendToMember(memberId, event);
  } catch (e) {
    console.warn('[calls] WS send failed:', e instanceof Error ? e.message : e);
  }
}

async function sendWsRoom(conversationId: string, event: WsMessengerEvent): Promise<void> {
  try {
    const { sendToRoomAll } = await import('../realtime/wsHub');
    sendToRoomAll(conversationId, event);
  } catch (e) {
    console.warn('[calls] WS room send failed:', e instanceof Error ? e.message : e);
  }
}

async function loadMemberProfile(
  memberId: number,
): Promise<{ name: string; avatarUrl: string | null }> {
  try {
    const res = await query(
      `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), name, 'Участник') AS full_name,
              avatar_url
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = res.rows[0] as { full_name?: string; avatar_url?: string | null } | undefined;
    return {
      name: String(row?.full_name ?? `Участник ${memberId}`).trim() || `Участник ${memberId}`,
      avatarUrl: row?.avatar_url != null ? String(row.avatar_url) : null,
    };
  } catch {
    return { name: `Участник ${memberId}`, avatarUrl: null };
  }
}

export async function isMemberBusyInCall(memberId: number, excludeCallId?: string): Promise<boolean> {
  const res = await query(
    `SELECT 1
     FROM call_participants cp
     JOIN calls c ON c.id = cp.call_id
     WHERE cp.user_id = $1
       AND c.status IN ('ringing', 'waiting', 'active')
       AND cp.status IN ('invited', 'ringing', 'joined')
       AND ($2::uuid IS NULL OR c.id <> $2::uuid)
     LIMIT 1`,
    [memberId, excludeCallId ?? null],
  );
  return res.rows.length > 0;
}

async function getParticipantRoleInConversation(
  conversationId: string,
  memberId: number,
): Promise<{ role: string; canManage: boolean } | null> {
  const res = await query(
    `SELECT role, permissions
     FROM conversation_participants
     WHERE conversation_id = $1::bigint AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  const row = res.rows[0] as { role?: string; permissions?: unknown } | undefined;
  if (!row) return null;
  const role = String(row.role ?? 'member');
  const perms =
    row.permissions && typeof row.permissions === 'object' && !Array.isArray(row.permissions)
      ? (row.permissions as Record<string, unknown>)
      : {};
  const canManage =
    role === 'owner' || role === 'admin' || perms.can_manage_chat === true;
  return { role, canManage };
}

function toPublicCall(
  call: CallRow,
  extras?: { inviteUrl?: string | null; participants?: CallPublic['participants'] },
): CallPublic {
  return {
    id: call.id,
    type: call.type,
    mediaType: call.media_type,
    status: call.status,
    conversationId: call.conversation_id,
    initiatedBy: call.initiated_by,
    accessMode: call.access_mode,
    createdAt: call.created_at,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    durationSeconds: call.duration_seconds,
    endReason: call.end_reason,
    inviteUrl: extras?.inviteUrl ?? null,
    participants: extras?.participants,
  };
}

async function loadCallById(callId: string, client?: DbClient): Promise<CallRow | null> {
  const q = client ?? { query };
  const res = await q.query(`SELECT * FROM calls WHERE id = $1::uuid LIMIT 1`, [callId]);
  const row = res.rows[0];
  return row ? mapCallRow(row) : null;
}

async function assertCanViewCall(call: CallRow, memberId: number): Promise<void> {
  const inConv = await isMemberInConversation(call.conversation_id, memberId);
  if (inConv) return;
  const part = await query(
    `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 LIMIT 1`,
    [call.id, memberId],
  );
  if (part.rows.length === 0) {
    throw new CallsError('forbidden', 'Нет доступа к этому звонку');
  }
}

async function insertCallHistoryMessage(input: {
  conversationId: string;
  callId: string;
  mediaType: CallMediaType;
  callType: CallType;
  status: CallStatus;
  durationSeconds: number | null;
  initiatedBy: number;
}): Promise<void> {
  const labels: Record<string, string> = {
    ended: input.mediaType === 'video' ? 'Видеозвонок' : 'Аудиозвонок',
    missed: 'Пропущенный вызов',
    declined: 'Вызов отклонён',
    cancelled: 'Вызов отменён',
    failed: 'Вызов не состоялся',
  };
  let content = labels[input.status] ?? (input.mediaType === 'video' ? 'Видеозвонок' : 'Аудиозвонок');
  if (input.status === 'ended' && input.durationSeconds != null && input.durationSeconds > 0) {
    const m = Math.floor(input.durationSeconds / 60);
    const s = input.durationSeconds % 60;
    content = `${content} · ${m}:${String(s).padStart(2, '0')}`;
  } else if (input.status === 'ended') {
    content = 'Вызов завершён';
  }

  const payload = {
    kind: 'call_event',
    call_id: input.callId,
    call_type: input.callType,
    media_type: input.mediaType,
    status: input.status,
    duration_seconds: input.durationSeconds,
    initiated_by: input.initiatedBy,
  };

  try {
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`, [
      input.conversationId,
    ]);
    const contentForDb = encryptMessageText(content);
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload)
       VALUES ($1::bigint, NULL, $2, 'text'::message_payload_type, $3::jsonb)`,
      [input.conversationId, contentForDb, JSON.stringify(payload)],
    );
    await sendWsRoom(input.conversationId, {
      type: 'conv:updated',
      conversationId: input.conversationId,
    });
  } catch (e) {
    console.warn('[calls] history message failed:', e instanceof Error ? e.message : e);
  }
}

async function finalizeCall(
  client: DbClient,
  call: CallRow,
  status: CallStatus,
  endReason: string,
): Promise<CallRow> {
  const startedAt = call.started_at ? new Date(call.started_at).getTime() : null;
  const duration =
    startedAt != null && status === 'ended'
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : null;
  const res = await client.query(
    `UPDATE calls
     SET status = $2,
         ended_at = NOW(),
         duration_seconds = COALESCE($3::int, duration_seconds),
         end_reason = $4
     WHERE id = $1::uuid AND status IN ('ringing', 'waiting', 'active')
     RETURNING *`,
    [call.id, status, duration, endReason],
  );
  const row = res.rows[0];
  if (!row) {
    const current = await loadCallById(call.id, client);
    if (!current) throw new CallsError('not_found', 'Звонок не найден');
    return current;
  }
  return mapCallRow(row);
}

async function createInvitationRaw(
  client: DbClient,
  callId: string,
  createdBy: number,
  maxUses: number | null,
): Promise<{ invitationId: string; rawToken: string; expiresAt: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashInviteToken(rawToken);
  const hours = inviteTtlHours();
  const res = await client.query(
    `INSERT INTO call_invitations (call_id, token_hash, created_by, expires_at, max_uses)
     VALUES ($1::uuid, $2, $3, NOW() + ($4::int * INTERVAL '1 hour'), $5)
     RETURNING id, expires_at`,
    [callId, tokenHash, createdBy, hours, maxUses],
  );
  const row = res.rows[0];
  return {
    invitationId: String(row.id),
    rawToken,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

function inviteUrlFromToken(rawToken: string): string {
  const origin = publicWebOrigin();
  const path = `/call/join/${rawToken}`;
  return origin ? `${origin}${path}` : path;
}

export async function createDirectCall(input: {
  initiatorId: number;
  conversationId: string;
  recipientId: number;
  mediaType: CallMediaType;
}): Promise<CallPublic> {
  if (!isCallsEnabled()) throw new CallsError('disabled', 'Звонки отключены');
  if (!Number.isFinite(input.recipientId) || input.recipientId === input.initiatorId) {
    throw new CallsError('invalid', 'Некорректный получатель');
  }

  const convType = await getConversationType(input.conversationId);
  if (convType !== 'private') {
    throw new CallsError('forbidden', 'Личный звонок доступен только в личном чате');
  }
  const [okA, okB] = await Promise.all([
    isMemberInConversation(input.conversationId, input.initiatorId),
    isMemberInConversation(input.conversationId, input.recipientId),
  ]);
  if (!okA || !okB) throw new CallsError('forbidden', 'Нет доступа к чату');

  if (await isMemberBusyInCall(input.initiatorId)) {
    throw new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
  }
  if (await isMemberBusyInCall(input.recipientId)) {
    throw new CallsError('busy', 'Абонент занят');
  }

  const callId = randomUUID();
  const roomName = `direct_${callId.replace(/-/g, '')}`;

  const call = await withTransaction(async (client) => {
    // Re-check busy inside transaction
    const busy = await client.query(
      `SELECT cp.user_id
       FROM call_participants cp
       JOIN calls c ON c.id = cp.call_id
       WHERE cp.user_id = ANY($1::int[])
         AND c.status IN ('ringing', 'waiting', 'active')
         AND cp.status IN ('invited', 'ringing', 'joined')
       LIMIT 1`,
      [[input.initiatorId, input.recipientId]],
    );
    if (busy.rows.length > 0) {
      const uid = Number(busy.rows[0].user_id);
      throw new CallsError(
        uid === input.initiatorId ? 'already_in_call' : 'busy',
        uid === input.initiatorId ? 'Вы уже участвуете в другом звонке' : 'Абонент занят',
      );
    }

    const ins = await client.query(
      `INSERT INTO calls (
         id, type, media_type, status, conversation_id, livekit_room_name,
         initiated_by, access_mode, metadata
       ) VALUES (
         $1::uuid, 'direct', $2, 'ringing', $3::bigint, $4, $5, 'closed',
         jsonb_build_object('ring_timeout_sec', $6::int)
       ) RETURNING *`,
      [
        callId,
        input.mediaType,
        input.conversationId,
        roomName,
        input.initiatorId,
        ringTimeoutSec(),
      ],
    );
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status)
       VALUES
         ($1::uuid, $2, 'initiator', 'joined'),
         ($1::uuid, $3, 'participant', 'ringing')`,
      [callId, input.initiatorId, input.recipientId],
    );
    return mapCallRow(ins.rows[0]);
  });

  try {
    await ensureLiveKitRoom({
      roomName,
      // Не рвать комнату при кратком reconnect клиента (иначе DeleteRoom mid-call).
      emptyTimeoutSec: Math.max(900, ringTimeoutSec() + 600),
      maxParticipants: 2,
      metadata: JSON.stringify({ callId: call.id, type: 'direct' }),
    });
  } catch (e) {
    console.error('[calls] LiveKit room create failed:', e instanceof Error ? e.message : e);
    if (!isLiveKitConfigured()) {
      // Allow ringing UI; token endpoint will fail clearly
    } else {
      await query(
        `UPDATE calls SET status = 'failed', ended_at = NOW(), end_reason = 'livekit_unavailable'
         WHERE id = $1::uuid`,
        [call.id],
      );
      throw new CallsError('livekit_unavailable', 'Сервис звонков временно недоступен');
    }
  }

  const profile = await loadMemberProfile(input.initiatorId);
  const incoming: WsMessengerEvent = {
    type: 'call:incoming',
    callId: call.id,
    callerId: input.initiatorId,
    conversationId: input.conversationId,
    callType: input.mediaType,
    callerName: profile.name,
    callerAvatar: profile.avatarUrl,
  };
  await sendWs(input.recipientId, incoming);

  const title = input.mediaType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок';
  void sendPushNotification(input.recipientId, {
    title,
    body: profile.name,
    type: 'incoming_call',
    callId: call.id,
    conversationId: input.conversationId,
    callType: input.mediaType,
    callerId: String(input.initiatorId),
    callerName: profile.name,
    url: `/call/${call.id}`,
    tag: `call-${call.id}`,
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'call_accept', title: 'Принять' },
      { action: 'call_decline', title: 'Отклонить' },
    ],
  }).catch((e) => console.warn('[calls] push failed:', e instanceof Error ? e.message : e));

  return toPublicCall(call);
}

export async function createGroupCall(input: {
  initiatorId: number;
  conversationId: string;
  mediaType: CallMediaType;
  accessMode?: CallAccessMode;
}): Promise<CallPublic> {
  if (!isCallsEnabled()) throw new CallsError('disabled', 'Звонки отключены');

  const convType = await getConversationType(input.conversationId);
  if (convType !== 'group' && convType !== 'channel') {
    throw new CallsError('forbidden', 'Групповой звонок доступен только в группе');
  }
  const membership = await getParticipantRoleInConversation(
    input.conversationId,
    input.initiatorId,
  );
  if (!membership) throw new CallsError('forbidden', 'Нет доступа к группе');

  if (await isMemberBusyInCall(input.initiatorId)) {
    throw new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
  }

  const accessMode: CallAccessMode = input.accessMode === 'link' ? 'link' : 'closed';
  const callId = randomUUID();
  const roomName = `group_${callId.replace(/-/g, '')}`;

  const { call, invite } = await withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO calls (
         id, type, media_type, status, conversation_id, livekit_room_name,
         initiated_by, access_mode, started_at, metadata
       ) VALUES (
         $1::uuid, 'group', $2, 'waiting', $3::bigint, $4, $5, $6, NOW(),
         '{}'::jsonb
       ) RETURNING *`,
      [callId, input.mediaType, input.conversationId, roomName, input.initiatorId, accessMode],
    );
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
       VALUES ($1::uuid, $2, 'initiator', 'joined', NOW())`,
      [callId, input.initiatorId],
    );
    const inv = await createInvitationRaw(client, callId, input.initiatorId, null);
    return { call: mapCallRow(ins.rows[0]), invite: inv };
  });

  try {
    await ensureLiveKitRoom({
      roomName,
      emptyTimeoutSec: 3600,
      maxParticipants: maxGroupParticipants(),
      metadata: JSON.stringify({ callId: call.id, type: 'group' }),
    });
  } catch (e) {
    console.error('[calls] LiveKit group room failed:', e instanceof Error ? e.message : e);
    if (isLiveKitConfigured()) {
      await query(
        `UPDATE calls SET status = 'failed', ended_at = NOW(), end_reason = 'livekit_unavailable'
         WHERE id = $1::uuid`,
        [call.id],
      );
      throw new CallsError('livekit_unavailable', 'Сервис звонков временно недоступен');
    }
  }

  const inviteUrl = inviteUrlFromToken(invite.rawToken);
  const meta = await getConversationMeta(input.conversationId);
  const memberIds = await getConversationMemberIds(input.conversationId);
  const initiatorProfile = await loadMemberProfile(input.initiatorId);

  const startedEvt: WsMessengerEvent = {
    type: 'group_call_started',
    callId: call.id,
    conversationId: input.conversationId,
    mediaType: input.mediaType,
    initiatedBy: input.initiatorId,
    initiatorName: initiatorProfile.name,
  };
  for (const mid of memberIds) {
    if (mid === input.initiatorId) continue;
    await sendWs(mid, startedEvt);
    void sendPushNotification(mid, {
      title: input.mediaType === 'video' ? 'Видеоконференция' : 'Аудиоконференция',
      body: `${initiatorProfile.name} · ${meta?.title?.trim() || 'Группа'}`,
      type: 'group_call_started',
      callId: call.id,
      conversationId: input.conversationId,
      url: `/call/${call.id}`,
      tag: `group-call-${call.id}`,
    }).catch(() => undefined);
  }

  // System message with invite link for closed/link modes
  try {
    const content =
      input.mediaType === 'video'
        ? `Начата видеоконференция`
        : `Начата аудиоконференция`;
    const contentForDb = encryptMessageText(content);
    const payload = {
      kind: 'call_event',
      call_id: call.id,
      call_type: 'group',
      media_type: input.mediaType,
      status: 'waiting',
      invite_path: `/call/join/${invite.rawToken}`,
      initiated_by: input.initiatorId,
    };
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`, [
      input.conversationId,
    ]);
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload)
       VALUES ($1::bigint, NULL, $2, 'text'::message_payload_type, $3::jsonb)`,
      [input.conversationId, contentForDb, JSON.stringify(payload)],
    );
    await sendWsRoom(input.conversationId, {
      type: 'conv:updated',
      conversationId: input.conversationId,
    });
  } catch (e) {
    console.warn('[calls] group history message:', e instanceof Error ? e.message : e);
  }

  return toPublicCall(call, { inviteUrl });
}

export async function getCallForMember(callId: string, memberId: number): Promise<CallPublic> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  await assertCanViewCall(call, memberId);

  const parts = await query(
    `SELECT cp.user_id, cp.role, cp.status,
            COALESCE(NULLIF(TRIM(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), m.name, '') AS name,
            m.avatar_url
     FROM call_participants cp
     JOIN members m ON m.id = cp.user_id
     WHERE cp.call_id = $1::uuid
     ORDER BY cp.created_at ASC`,
    [callId],
  );

  return toPublicCall(call, {
    participants: parts.rows.map((r) => ({
      userId: Number(r.user_id),
      role: r.role as CallParticipantRole,
      status: r.status as CallParticipantStatus,
      name: String(r.name ?? ''),
      avatarUrl: r.avatar_url != null ? String(r.avatar_url) : null,
    })),
  });
}

export async function acceptCall(callId: string, memberId: number): Promise<CallPublic> {
  if (!isCallsEnabled()) throw new CallsError('disabled', 'Звонки отключены');

  const updated = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    const row = locked.rows[0];
    if (!row) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(row);
    if (call.type !== 'direct') {
      throw new CallsError('invalid', 'Принятие доступно только для личного звонка');
    }
    if (call.status !== 'ringing') {
      throw new CallsError('conflict', 'Звонок уже обработан');
    }

    const part = await client.query(
      `SELECT * FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 FOR UPDATE`,
      [callId, memberId],
    );
    if (!part.rows[0]) throw new CallsError('forbidden', 'Вы не участник этого звонка');

    if (await isMemberBusyInCall(memberId, callId)) {
      throw new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
    }

    await client.query(
      `UPDATE call_participants
       SET status = 'joined', joined_at = COALESCE(joined_at, NOW())
       WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    const up = await client.query(
      `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
       WHERE id = $1::uuid AND status = 'ringing'
       RETURNING *`,
      [callId],
    );
    if (!up.rows[0]) throw new CallsError('conflict', 'Звонок уже обработан');
    return mapCallRow(up.rows[0]);
  });

  await sendWs(updated.initiated_by, { type: 'call:accepted', callId: updated.id });
  return toPublicCall(updated);
}

export async function declineCall(callId: string, memberId: number): Promise<CallPublic> {
  const updated = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);
    if (call.type !== 'direct' || call.status !== 'ringing') {
      throw new CallsError('conflict', 'Звонок нельзя отклонить');
    }
    const part = await client.query(
      `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    if (!part.rows[0] || call.initiated_by === memberId) {
      throw new CallsError('forbidden', 'Нельзя отклонить этот звонок');
    }
    await client.query(
      `UPDATE call_participants SET status = 'declined' WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    return finalizeCall(client, call, 'declined', 'declined');
  });

  await sendWs(updated.initiated_by, {
    type: 'call:rejected',
    callId: updated.id,
    reason: 'declined',
  });
  void sendPushNotification(updated.initiated_by, {
    title: 'Звонок отклонён',
    body: 'Абонент отклонил вызов',
    type: 'call_declined',
    callId: updated.id,
    url: `/messenger?conversationId=${updated.conversation_id}`,
    tag: `call-${updated.id}`,
  }).catch(() => undefined);

  await endLiveKitRoom(updated.livekit_room_name);
  await insertCallHistoryMessage({
    conversationId: updated.conversation_id,
    callId: updated.id,
    mediaType: updated.media_type,
    callType: updated.type,
    status: 'declined',
    durationSeconds: null,
    initiatedBy: updated.initiated_by,
  });
  return toPublicCall(updated);
}

export async function cancelCall(callId: string, memberId: number): Promise<CallPublic> {
  const { updated, recipientIds } = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);
    if (call.initiated_by !== memberId) {
      throw new CallsError('forbidden', 'Отменить может только инициатор');
    }
    if (call.status !== 'ringing' && !(call.type === 'group' && call.status === 'waiting')) {
      throw new CallsError('conflict', 'Звонок нельзя отменить');
    }
    const parts = await client.query(
      `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
      [callId, memberId],
    );
    const finalStatus: CallStatus = call.type === 'group' ? 'cancelled' : 'cancelled';
    const done = await finalizeCall(client, call, finalStatus, 'cancelled');
    return {
      updated: done,
      recipientIds: parts.rows.map((r) => Number(r.user_id)),
    };
  });

  for (const rid of recipientIds) {
    await sendWs(rid, { type: 'call:cancelled', callId: updated.id });
    void sendPushNotification(rid, {
      title: 'Звонок отменён',
      body: 'Вызов отменён',
      type: 'call_cancelled',
      callId: updated.id,
      url: `/messenger?conversationId=${updated.conversation_id}`,
      tag: `call-${updated.id}`,
    }).catch(() => undefined);
  }
  await endLiveKitRoom(updated.livekit_room_name);
  await insertCallHistoryMessage({
    conversationId: updated.conversation_id,
    callId: updated.id,
    mediaType: updated.media_type,
    callType: updated.type,
    status: 'cancelled',
    durationSeconds: null,
    initiatedBy: updated.initiated_by,
  });
  return toPublicCall(updated);
}

export async function endCall(callId: string, memberId: number): Promise<CallPublic> {
  const { updated, notifyIds } = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);

    if (!['ringing', 'waiting', 'active'].includes(call.status)) {
      throw new CallsError('conflict', 'Звонок уже завершён');
    }

    const part = await client.query(
      `SELECT role, status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
    const isParticipant = Boolean(part.rows[0]);
    const isModerator =
      call.initiated_by === memberId ||
      part.rows[0]?.role === 'moderator' ||
      part.rows[0]?.role === 'initiator' ||
      Boolean(membership?.canManage);

    if (call.type === 'direct') {
      if (!isParticipant) throw new CallsError('forbidden', 'Нет доступа');
      const done = await finalizeCall(client, call, call.status === 'ringing' ? 'cancelled' : 'ended', 'ended');
      const others = await client.query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
        [callId, memberId],
      );
      return {
        updated: done,
        notifyIds: others.rows.map((r) => Number(r.user_id)),
      };
    }

    // Group: leave vs end conference
    if (!isParticipant && !membership) {
      throw new CallsError('forbidden', 'Нет доступа');
    }

    // If moderator ends — finish whole call
    if (isModerator && (call.status === 'waiting' || call.status === 'active')) {
      // Explicit end of conference
      const done = await finalizeCall(client, call, 'ended', 'ended_by_moderator');
      const others = await client.query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
        [callId, memberId],
      );
      return {
        updated: done,
        notifyIds: others.rows.map((r) => Number(r.user_id)),
      };
    }

    // Regular participant leaves
    await client.query(
      `UPDATE call_participants
       SET status = 'left', left_at = NOW()
       WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    try {
      await removeLiveKitParticipant(call.livekit_room_name, livekitIdentityForMember(memberId));
    } catch {
      /* ignore */
    }

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS c FROM call_participants
       WHERE call_id = $1::uuid AND status = 'joined'`,
      [callId],
    );
    const count = Number(remaining.rows[0]?.c ?? 0);
    if (count === 0) {
      const done = await finalizeCall(client, call, 'ended', 'all_left');
      return { updated: done, notifyIds: [] as number[] };
    }

    // Promote waiting → active if someone still there
    if (call.status === 'waiting' && count > 0) {
      await client.query(
        `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
         WHERE id = $1::uuid AND status = 'waiting'`,
        [callId],
      );
    }

    const current = await loadCallById(callId, client);
    return { updated: current!, notifyIds: [] as number[] };
  });

  const duration = updated.duration_seconds ?? undefined;
  for (const nid of notifyIds) {
    await sendWs(nid, {
      type: 'call:ended',
      callId: updated.id,
      reason: updated.end_reason ?? 'ended',
      duration,
    });
  }

  if (['ended', 'cancelled', 'missed', 'declined', 'failed'].includes(updated.status)) {
    await endLiveKitRoom(updated.livekit_room_name);
    if (updated.status === 'ended' || updated.end_reason === 'all_left') {
      await insertCallHistoryMessage({
        conversationId: updated.conversation_id,
        callId: updated.id,
        mediaType: updated.media_type,
        callType: updated.type,
        status: 'ended',
        durationSeconds: updated.duration_seconds,
        initiatedBy: updated.initiated_by,
      });
    }
  } else {
    await sendWsRoom(updated.conversation_id, {
      type: 'call:participant_left',
      callId: updated.id,
      userId: memberId,
    });
  }

  return toPublicCall(updated);
}

export async function issueCallToken(
  callId: string,
  memberId: number,
): Promise<{ token: string; url: string; identity: string; call: CallPublic }> {
  if (!isCallsEnabled()) throw new CallsError('disabled', 'Звонки отключены');
  if (!isLiveKitConfigured()) {
    throw new CallsError('livekit_unavailable', 'Сервис звонков не настроен');
  }

  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');

  if (!['ringing', 'waiting', 'active'].includes(call.status)) {
    throw new CallsError('conflict', 'Звонок недоступен для подключения');
  }

  // Direct: initiator may get token while ringing; callee only after accept (active) or if already joined
  const part = await query(
    `SELECT role, status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
    [callId, memberId],
  );
  let participant = part.rows[0] as { role?: string; status?: string } | undefined;

  if (!participant) {
    if (call.type === 'group') {
      const inConv = await isMemberInConversation(call.conversation_id, memberId);
      if (!inConv || call.access_mode !== 'closed') {
        throw new CallsError('forbidden', 'Нет доступа к конференции');
      }
      // Auto-join closed group members
      const joinedCount = await query(
        `SELECT COUNT(*)::int AS c FROM call_participants WHERE call_id = $1::uuid AND status = 'joined'`,
        [callId],
      );
      if (Number(joinedCount.rows[0]?.c ?? 0) >= maxGroupParticipants()) {
        throw new CallsError('full', 'Достигнут лимит участников');
      }
      await query(
        `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
         VALUES ($1::uuid, $2, 'participant', 'joined', NOW())
         ON CONFLICT (call_id, user_id) DO UPDATE
           SET status = 'joined', joined_at = COALESCE(call_participants.joined_at, NOW()), left_at = NULL`,
        [callId, memberId],
      );
      if (call.status === 'waiting') {
        await query(
          `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
           WHERE id = $1::uuid AND status = 'waiting'`,
          [callId],
        );
      }
      participant = { role: 'participant', status: 'joined' };
      await sendWsRoom(call.conversation_id, {
        type: 'call:participant_joined',
        callId: call.id,
        userId: memberId,
      });
    } else {
      throw new CallsError('forbidden', 'Нет доступа');
    }
  }

  if (call.type === 'direct') {
    if (memberId !== call.initiated_by && call.status === 'ringing') {
      throw new CallsError('conflict', 'Сначала примите звонок');
    }
    if (participant.status === 'declined' || participant.status === 'missed') {
      throw new CallsError('forbidden', 'Нет доступа к звонку');
    }
  }

  const profile = await loadMemberProfile(memberId);
  const isModerator =
    participant.role === 'initiator' ||
    participant.role === 'moderator' ||
    call.initiated_by === memberId;

  await ensureLiveKitRoom({
    roomName: call.livekit_room_name,
    maxParticipants: call.type === 'direct' ? 2 : maxGroupParticipants(),
  });

  // Mark joined
  await query(
    `UPDATE call_participants
     SET status = 'joined', joined_at = COALESCE(joined_at, NOW()), left_at = NULL
     WHERE call_id = $1::uuid AND user_id = $2`,
    [callId, memberId],
  );

  const minted = await mintLiveKitJoinToken({
    roomName: call.livekit_room_name,
    identity: livekitIdentityForMember(memberId),
    displayName: profile.name,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: isModerator && call.type === 'group',
  });

  const pub = await getCallForMember(callId, memberId);
  return { ...minted, call: pub };
}

export async function createInvitation(
  callId: string,
  memberId: number,
  options?: { maxUses?: number | null; accessMode?: CallAccessMode },
): Promise<{ invitationId: string; inviteUrl: string; expiresAt: string }> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  if (call.type !== 'group') throw new CallsError('invalid', 'Приглашения только для групп');
  if (!['waiting', 'active'].includes(call.status)) {
    throw new CallsError('conflict', 'Конференция завершена');
  }

  const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
  const part = await query(
    `SELECT role FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
    [callId, memberId],
  );
  const canInvite =
    call.initiated_by === memberId ||
    Boolean(membership?.canManage) ||
    part.rows[0]?.role === 'moderator' ||
    part.rows[0]?.role === 'initiator';
  if (!canInvite) throw new CallsError('forbidden', 'Недостаточно прав для приглашения');

  if (options?.accessMode === 'link' && call.access_mode !== 'link') {
    await query(`UPDATE calls SET access_mode = 'link' WHERE id = $1::uuid`, [callId]);
  }

  const invite = await withTransaction(async (client) =>
    createInvitationRaw(client, callId, memberId, options?.maxUses ?? null),
  );

  return {
    invitationId: invite.invitationId,
    inviteUrl: inviteUrlFromToken(invite.rawToken),
    expiresAt: invite.expiresAt,
  };
}

export async function revokeInvitation(
  callId: string,
  invitationId: string,
  memberId: number,
): Promise<void> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
  const can =
    call.initiated_by === memberId || Boolean(membership?.canManage);
  if (!can) throw new CallsError('forbidden', 'Недостаточно прав');

  const res = await query(
    `UPDATE call_invitations
     SET revoked_at = NOW()
     WHERE id = $1::uuid AND call_id = $2::uuid AND revoked_at IS NULL
     RETURNING id`,
    [invitationId, callId],
  );
  if (!res.rows[0]) throw new CallsError('not_found', 'Приглашение не найдено');
}

export async function getInvitationPreview(rawToken: string, memberId: number | null): Promise<{
  valid: boolean;
  reason?: string;
  mediaType?: CallMediaType;
  callStatus?: CallStatus;
  conversationTitle?: string | null;
  participantCount?: number;
  requiresAuth: boolean;
  canJoin: boolean;
  callId?: string;
}> {
  const tokenHash = hashInviteToken(rawToken);
  const res = await query(
    `SELECT i.id, i.expires_at, i.revoked_at, i.max_uses, i.use_count,
            c.id AS call_id, c.status AS call_status, c.media_type, c.access_mode,
            c.conversation_id, c.type AS call_type
     FROM call_invitations i
     JOIN calls c ON c.id = i.call_id
     WHERE i.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = res.rows[0];
  if (!row) {
    return { valid: false, reason: 'not_found', requiresAuth: true, canJoin: false };
  }
  if (row.revoked_at) {
    return { valid: false, reason: 'revoked', requiresAuth: true, canJoin: false };
  }
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { valid: false, reason: 'expired', requiresAuth: true, canJoin: false };
  }
  if (row.max_uses != null && Number(row.use_count) >= Number(row.max_uses)) {
    return { valid: false, reason: 'exhausted', requiresAuth: true, canJoin: false };
  }
  if (!['waiting', 'active'].includes(String(row.call_status))) {
    return {
      valid: false,
      reason: 'call_ended',
      callStatus: row.call_status as CallStatus,
      requiresAuth: true,
      canJoin: false,
    };
  }

  let conversationTitle: string | null = null;
  let canJoin = false;
  if (memberId != null) {
    const inConv = await isMemberInConversation(String(row.conversation_id), memberId);
    if (row.access_mode === 'closed' && !inConv) {
      return {
        valid: true,
        reason: 'no_group_access',
        mediaType: row.media_type as CallMediaType,
        callStatus: row.call_status as CallStatus,
        requiresAuth: true,
        canJoin: false,
        callId: String(row.call_id),
      };
    }
    canJoin = row.access_mode === 'link' || inConv;
    if (inConv) {
      const meta = await getConversationMeta(String(row.conversation_id));
      conversationTitle = meta?.title ?? null;
    }
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS c FROM call_participants WHERE call_id = $1::uuid AND status = 'joined'`,
    [row.call_id],
  );

  return {
    valid: true,
    mediaType: row.media_type as CallMediaType,
    callStatus: row.call_status as CallStatus,
    conversationTitle,
    participantCount: Number(countRes.rows[0]?.c ?? 0),
    requiresAuth: true,
    canJoin: memberId != null && canJoin,
    callId: String(row.call_id),
  };
}

export async function joinViaInvitation(
  rawToken: string,
  memberId: number,
): Promise<{ token: string; url: string; identity: string; call: CallPublic }> {
  if (!isCallsEnabled()) throw new CallsError('disabled', 'Звонки отключены');
  if (!isLiveKitConfigured()) {
    throw new CallsError('livekit_unavailable', 'Сервис звонков не настроен');
  }

  const tokenHash = hashInviteToken(rawToken);

  const callId = await withTransaction(async (client) => {
    const res = await client.query(
      `SELECT i.id AS invitation_id, i.expires_at, i.revoked_at, i.max_uses, i.use_count,
              c.*
       FROM call_invitations i
       JOIN calls c ON c.id = i.call_id
       WHERE i.token_hash = $1
       FOR UPDATE OF i, c`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) throw new CallsError('invite_invalid', 'Приглашение недействительно');
    if (row.revoked_at) throw new CallsError('invite_revoked', 'Приглашение отозвано');
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      throw new CallsError('invite_expired', 'Срок приглашения истёк');
    }
    if (row.max_uses != null && Number(row.use_count) >= Number(row.max_uses)) {
      throw new CallsError('invite_invalid', 'Лимит использований исчерпан');
    }
    const call = mapCallRow(row);
    if (!['waiting', 'active'].includes(call.status)) {
      throw new CallsError('conflict', 'Конференция завершена');
    }

    if (call.access_mode === 'closed') {
      const inConv = await isMemberInConversation(call.conversation_id, memberId);
      if (!inConv) throw new CallsError('forbidden', 'Нет доступа к группе');
    }

    const joinedCount = await client.query(
      `SELECT COUNT(*)::int AS c FROM call_participants
       WHERE call_id = $1::uuid AND status = 'joined'`,
      [call.id],
    );
    const existing = await client.query(
      `SELECT status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [call.id, memberId],
    );
    const alreadyJoined = existing.rows[0]?.status === 'joined';
    if (!alreadyJoined && Number(joinedCount.rows[0]?.c ?? 0) >= maxGroupParticipants()) {
      throw new CallsError('full', 'Достигнут лимит участников');
    }

    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
       VALUES ($1::uuid, $2, 'participant', 'joined', NOW())
       ON CONFLICT (call_id, user_id) DO UPDATE
         SET status = 'joined',
             joined_at = COALESCE(call_participants.joined_at, NOW()),
             left_at = NULL`,
      [call.id, memberId],
    );

    if (!alreadyJoined) {
      await client.query(
        `UPDATE call_invitations
         SET use_count = use_count + 1
         WHERE id = $1::uuid
           AND revoked_at IS NULL
           AND (max_uses IS NULL OR use_count < max_uses)`,
        [row.invitation_id],
      );
    }

    if (call.status === 'waiting') {
      await client.query(
        `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
         WHERE id = $1::uuid AND status = 'waiting'`,
        [call.id],
      );
    }

    return call.id;
  });

  await sendWsRoom(
    (await loadCallById(callId))!.conversation_id,
    { type: 'call:participant_joined', callId, userId: memberId },
  );

  return issueCallToken(callId, memberId);
}

export async function listCallHistory(input: {
  memberId: number;
  conversationId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: CallPublic[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const params: unknown[] = [input.memberId];
  let convFilter = '';
  if (input.conversationId) {
    const ok = await isMemberInConversation(input.conversationId, input.memberId);
    if (!ok) throw new CallsError('forbidden', 'Нет доступа к чату');
    params.push(input.conversationId);
    convFilter = `AND c.conversation_id = $${params.length}::bigint`;
  }
  let cursorFilter = '';
  if (input.cursor) {
    params.push(input.cursor);
    cursorFilter = `AND c.created_at < $${params.length}::timestamptz`;
  }
  params.push(limit + 1);

  const res = await query(
    `SELECT c.*
     FROM calls c
     WHERE EXISTS (
       SELECT 1 FROM conversation_participants cp
       WHERE cp.conversation_id = c.conversation_id
         AND cp.member_id = $1
         AND cp.left_at IS NULL
     )
     ${convFilter}
     ${cursorFilter}
     ORDER BY c.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const rows = res.rows.map((r) => mapCallRow(r));
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((c) => toPublicCall(c));
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt ?? null : null;
  return { items, nextCursor };
}

/** Cron: ringing past timeout → missed */
export async function cleanupStaleCalls(): Promise<{ missed: number; endedEmpty: number }> {
  const timeout = ringTimeoutSec();
  const ringing = await query(
    `SELECT * FROM calls
     WHERE status = 'ringing'
       AND created_at < NOW() - ($1::int * INTERVAL '1 second')
     LIMIT 100`,
    [timeout],
  );

  let missed = 0;
  for (const row of ringing.rows) {
    const call = mapCallRow(row);
    try {
      const done = await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM calls WHERE id = $1::uuid AND status = 'ringing' FOR UPDATE`,
          [call.id],
        );
        if (!locked.rows[0]) return null;
        await client.query(
          `UPDATE call_participants SET status = 'missed'
           WHERE call_id = $1::uuid AND status = 'ringing'`,
          [call.id],
        );
        return finalizeCall(client, mapCallRow(locked.rows[0]), 'missed', 'no_answer');
      });
      if (!done) continue;
      missed += 1;
      await endLiveKitRoom(done.livekit_room_name);
      const parts = await query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid`,
        [done.id],
      );
      for (const p of parts.rows) {
        await sendWs(Number(p.user_id), {
          type: 'call:ended',
          callId: done.id,
          reason: 'no_answer',
        });
      }
      // Missed push to callee
      const callee = parts.rows.find((p) => Number(p.user_id) !== done.initiated_by);
      if (callee) {
        void sendPushNotification(Number(callee.user_id), {
          title: 'Пропущенный вызов',
          body: done.media_type === 'video' ? 'Видеозвонок' : 'Аудиозвонок',
          type: 'missed_call',
          callId: done.id,
          conversationId: done.conversation_id,
          url: `/messenger?conversationId=${done.conversation_id}`,
          tag: `call-${done.id}`,
        }).catch(() => undefined);
      }
      await insertCallHistoryMessage({
        conversationId: done.conversation_id,
        callId: done.id,
        mediaType: done.media_type,
        callType: done.type,
        status: 'missed',
        durationSeconds: null,
        initiatedBy: done.initiated_by,
      });
    } catch (e) {
      console.warn('[calls] miss cleanup:', e instanceof Error ? e.message : e);
    }
  }

  // Empty group calls waiting too long with no joined besides stale
  const empty = await query(
    `SELECT c.*
     FROM calls c
     WHERE c.type = 'group'
       AND c.status IN ('waiting', 'active')
       AND c.created_at < NOW() - INTERVAL '6 hours'
       AND NOT EXISTS (
         SELECT 1 FROM call_participants cp
         WHERE cp.call_id = c.id AND cp.status = 'joined'
       )
     LIMIT 50`,
  );
  let endedEmpty = 0;
  for (const row of empty.rows) {
    const call = mapCallRow(row);
    try {
      await withTransaction(async (client) => {
        await finalizeCall(client, call, 'ended', 'expired_empty');
      });
      await endLiveKitRoom(call.livekit_room_name);
      endedEmpty += 1;
    } catch {
      /* ignore */
    }
  }

  // Revoke/cleanup old invitations (mark expired visually by leaving rows; optional delete)
  await query(
    `UPDATE call_invitations
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE revoked_at IS NULL AND expires_at < NOW() - INTERVAL '7 days'`,
  ).catch(() => undefined);

  return { missed, endedEmpty };
}
