import {query} from '../config/db';

/** Non-chat entities eligible for offline sync. */
export type SyncTableName = 'songs' | 'members' | 'church_events' | 'sermon_notes';

export interface SyncPullOptions {
  table: SyncTableName;
  /** Legacy ISO timestamp filter (still accepted). Prefer cursor=sync_seq. */
  since: string | null;
  /** Monotonic sync_seq cursor (stringified bigint). Legacy offset no longer used when sync_seq present. */
  cursor: string | null;
  limit?: number;
}

export interface SyncPushItem {
  id: string;
  table: SyncTableName;
  operation: 'create' | 'update' | 'delete';
  recordId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deviceId?: string;
  /** Client idempotency key (UUIDv7 recommended). */
  idempotencyKey?: string;
}

export interface SyncPushResult {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  /** applied | conflict | rejected */
  status?: 'applied' | 'conflict' | 'rejected';
  conflict?: boolean;
  record?: Record<string, unknown>;
}

const PULL_LIMIT = 100;
const SYNC_TABLES: SyncTableName[] = ['songs', 'members', 'church_events', 'sermon_notes'];

export function isSyncTable(value: string): value is SyncTableName {
  return (SYNC_TABLES as string[]).includes(value);
}

function parseSince(since: string | null): Date | null {
  if (!since) return null;
  const d = new Date(since);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseSeqCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function parseUpdatedAt(payload: Record<string, unknown>): Date {
  const raw = payload.updated_at ?? payload.deleted_at;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) return d;
  }
  return new Date();
}

function rowToSyncRecord(table: SyncTableName, row: Record<string, unknown>): Record<string, unknown> {
  const base = {
    id: String(row.id),
    client_id: row.client_id ?? null,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
    version: row.version ?? 1,
    sync_seq: row.sync_seq != null ? String(row.sync_seq) : null,
    device_id: row.device_id ?? null,
  };

  if (table === 'songs') {
    return {
      ...base,
      song_number: row.song_number ?? null,
      title: row.title,
      slug: row.slug,
      content: row.content,
      default_key: row.default_key ?? null,
      tempo: row.tempo ?? null,
      time_signature: row.time_signature ?? null,
      tags: row.tags ?? [],
      is_published: row.is_published,
      created_by_device: row.created_by_device ?? null,
    };
  }

  if (table === 'members') {
    return {
      ...base,
      first_name: row.first_name,
      last_name: row.last_name,
      username: row.username ?? null,
      app_role: row.app_role ?? null,
    };
  }

  if (table === 'church_events') {
    return {
      ...base,
      title: row.title,
      description: row.description ?? null,
      event_date: row.event_date ?? null,
      event_time: row.event_time ?? null,
      recurrence_type: row.recurrence_type ?? 'once',
      weekly_day: row.weekly_day ?? null,
      is_active: row.is_active ?? true,
    };
  }

  // sermon_notes
  return {
    ...base,
    member_id: row.member_id != null ? String(row.member_id) : null,
    title: row.title ?? null,
    body: row.body ?? row.content ?? null,
    body_format: row.body_format ?? 'plain',
    service_plan_id: row.service_plan_id != null ? String(row.service_plan_id) : null,
  };
}

async function loadRecord(
  table: SyncTableName,
  recordId: string,
): Promise<Record<string, unknown> | null> {
  if (table === 'members') {
    const res = await query(
      `SELECT m.*, up.username FROM members m
       LEFT JOIN user_profiles up ON up.member_id = m.id
       WHERE m.id = $1 LIMIT 1`,
      [recordId],
    );
    return res.rows[0] ? rowToSyncRecord(table, res.rows[0]) : null;
  }
  if (table === 'songs') {
    const res = await query(`SELECT * FROM songs WHERE id = $1::bigint LIMIT 1`, [recordId]);
    return res.rows[0] ? rowToSyncRecord(table, res.rows[0]) : null;
  }
  if (table === 'church_events') {
    const res = await query(`SELECT * FROM church_events WHERE id = $1::bigint LIMIT 1`, [recordId]);
    return res.rows[0] ? rowToSyncRecord(table, res.rows[0]) : null;
  }
  const res = await query(`SELECT * FROM sermon_notes WHERE id = $1::bigint LIMIT 1`, [recordId]);
  return res.rows[0] ? rowToSyncRecord(table, res.rows[0]) : null;
}

export async function pullSyncChanges(opts: SyncPullOptions): Promise<{
  records: Record<string, unknown>[];
  nextCursor: string | null;
  serverTime: string;
}> {
  const since = parseSince(opts.since);
  const afterSeq = parseSeqCursor(opts.cursor);
  const limit = opts.limit ?? PULL_LIMIT;

  const params: unknown[] = [afterSeq];
  let where = `sync_seq IS NOT NULL AND sync_seq > $1`;
  if (since) {
    params.push(since.toISOString());
    where += ` AND updated_at > $${params.length}::timestamptz`;
  }
  params.push(limit);

  if (opts.table === 'members') {
    const res = await query(
      `SELECT m.*, up.username
       FROM members m
       LEFT JOIN user_profiles up ON up.member_id = m.id
       WHERE m.sync_seq IS NOT NULL AND m.sync_seq > $1
       ${since ? `AND m.updated_at > $2::timestamptz` : ''}
       ORDER BY m.sync_seq ASC
       LIMIT $${params.length}`,
      params,
    );
    const records = res.rows.map(r => rowToSyncRecord('members', r));
    const lastSeq = records.length
      ? String(records[records.length - 1]!.sync_seq)
      : null;
    const nextCursor = records.length >= limit ? lastSeq : null;
    return {records, nextCursor, serverTime: new Date().toISOString()};
  }

  const table = opts.table;
  const res = await query(
    `SELECT * FROM ${table} WHERE ${where} ORDER BY sync_seq ASC LIMIT $${params.length}`,
    params,
  );
  const records = res.rows.map(r => rowToSyncRecord(table, r));
  const lastSeq = records.length ? String(records[records.length - 1]!.sync_seq) : null;
  const nextCursor = records.length >= limit ? lastSeq : null;
  return {records, nextCursor, serverTime: new Date().toISOString()};
}

async function getIdempotentResult(
  key: string | undefined,
  memberId: number,
): Promise<SyncPushResult | null> {
  if (!key) return null;
  const existing = await query(
    `SELECT result FROM sync_idempotency WHERE idempotency_key = $1 AND member_id = $2 LIMIT 1`,
    [key, memberId],
  );
  if (!existing.rows[0]) return null;
  return existing.rows[0].result as SyncPushResult;
}

async function saveIdempotentResult(
  key: string | undefined,
  memberId: number,
  table: SyncTableName,
  result: SyncPushResult,
): Promise<void> {
  if (!key) return;
  await query(
    `INSERT INTO sync_idempotency (idempotency_key, member_id, table_name, result)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, memberId, table, JSON.stringify(result)],
  );
}

async function pushSongItem(item: SyncPushItem, memberId: number): Promise<SyncPushResult> {
  const payload = item.payload ?? {};
  const updatedAt = parseUpdatedAt(payload);

  if (item.operation === 'create') {
    if (!item.clientId) {
      return {id: item.id, ok: false, status: 'rejected', error: 'clientId required for create'};
    }
    const existing = await query(
      `SELECT id::text FROM songs WHERE client_id = $1::uuid LIMIT 1`,
      [item.clientId],
    );
    if (existing.rows[0]) {
      const record = await loadRecord('songs', existing.rows[0].id);
      return {id: item.id, ok: true, serverId: existing.rows[0].id, status: 'conflict', conflict: true, record: record ?? undefined};
    }

    const title = String(payload.title ?? '').trim() || 'Без названия';
    const slug = String(payload.slug ?? '').trim() || `song-${item.clientId.slice(0, 8)}`;
    const insert = await query(
      `INSERT INTO songs (
         title, slug, content, default_key, tags, is_published,
         client_id, created_by_member_id, created_by_device, device_id, updated_at
       ) VALUES ($1, $2, $3, $4, '{}'::text[], FALSE, $5::uuid, $6, $7, $7, $8)
       RETURNING id::text`,
      [
        title,
        slug,
        String(payload.content ?? ''),
        payload.default_key != null ? String(payload.default_key) : null,
        item.clientId,
        memberId,
        item.deviceId ?? null,
        updatedAt.toISOString(),
      ],
    );
    const serverId = insert.rows[0]?.id as string;
    const record = await loadRecord('songs', serverId);
    return {id: item.id, ok: true, serverId, status: 'applied', record: record ?? undefined};
  }

  const recordId = item.recordId ?? null;
  if (!recordId) {
    return {id: item.id, ok: false, status: 'rejected', error: 'recordId required'};
  }

  if (item.operation === 'delete') {
    await query(
      `UPDATE songs SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz WHERE id = $1::bigint`,
      [recordId, updatedAt.toISOString()],
    );
    const record = await loadRecord('songs', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
  }

  const current = await query(
    `SELECT updated_at, version FROM songs WHERE id = $1::bigint LIMIT 1`,
    [recordId],
  );
  if (!current.rows[0]) {
    return {id: item.id, ok: false, status: 'rejected', error: 'not found'};
  }
  const serverTs = new Date(current.rows[0].updated_at).getTime();
  const clientTs = updatedAt.getTime();
  if (clientTs < serverTs) {
    const record = await loadRecord('songs', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'conflict', conflict: true, record: record ?? undefined};
  }

  await query(
    `UPDATE songs SET
       title = COALESCE($2, title),
       slug = COALESCE($3, slug),
       content = COALESCE($4, content),
       default_key = COALESCE($5, default_key),
       device_id = COALESCE($7, device_id),
       updated_at = $6::timestamptz
     WHERE id = $1::bigint`,
    [
      recordId,
      payload.title != null ? String(payload.title) : null,
      payload.slug != null ? String(payload.slug) : null,
      payload.content != null ? String(payload.content) : null,
      payload.default_key != null ? String(payload.default_key) : null,
      updatedAt.toISOString(),
      item.deviceId ?? null,
    ],
  );
  const record = await loadRecord('songs', recordId);
  return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
}

async function pushChurchEventItem(item: SyncPushItem, memberId: number): Promise<SyncPushResult> {
  const payload = item.payload ?? {};
  const updatedAt = parseUpdatedAt(payload);

  if (item.operation === 'create') {
    if (!item.clientId) {
      return {id: item.id, ok: false, status: 'rejected', error: 'clientId required'};
    }
    const existing = await query(
      `SELECT id::text FROM church_events WHERE client_id = $1::uuid LIMIT 1`,
      [item.clientId],
    );
    if (existing.rows[0]) {
      const record = await loadRecord('church_events', existing.rows[0].id);
      return {id: item.id, ok: true, serverId: existing.rows[0].id, status: 'conflict', conflict: true, record: record ?? undefined};
    }
    const title = String(payload.title ?? '').trim() || 'Событие';
    const eventDate =
      payload.event_date != null
        ? String(payload.event_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const eventTime =
      payload.event_time != null ? String(payload.event_time).slice(0, 8) : '12:00:00';
    const insert = await query(
      `INSERT INTO church_events (title, description, event_date, event_time, is_active, client_id, device_id, updated_at)
       VALUES ($1, $2, $3::date, $4::time, TRUE, $5::uuid, $6, $7::timestamptz)
       RETURNING id::text`,
      [
        title,
        payload.description != null ? String(payload.description) : null,
        eventDate,
        eventTime,
        item.clientId,
        item.deviceId ?? null,
        updatedAt.toISOString(),
      ],
    );
    void memberId;
    const serverId = insert.rows[0]?.id as string;
    const record = await loadRecord('church_events', serverId);
    return {id: item.id, ok: true, serverId, status: 'applied', record: record ?? undefined};
  }

  const recordId = item.recordId;
  if (!recordId) return {id: item.id, ok: false, status: 'rejected', error: 'recordId required'};

  if (item.operation === 'delete') {
    await query(
      `UPDATE church_events SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz, is_active = FALSE WHERE id = $1::bigint`,
      [recordId, updatedAt.toISOString()],
    );
    const record = await loadRecord('church_events', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
  }

  const current = await query(`SELECT updated_at FROM church_events WHERE id = $1::bigint LIMIT 1`, [recordId]);
  if (!current.rows[0]) return {id: item.id, ok: false, status: 'rejected', error: 'not found'};
  if (updatedAt.getTime() < new Date(current.rows[0].updated_at).getTime()) {
    const record = await loadRecord('church_events', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'conflict', conflict: true, record: record ?? undefined};
  }

  await query(
    `UPDATE church_events SET
       title = COALESCE($2, title),
       description = COALESCE($3, description),
       event_date = COALESCE($4::date, event_date),
       event_time = COALESCE($5::time, event_time),
       device_id = COALESCE($7, device_id),
       updated_at = $6::timestamptz
     WHERE id = $1::bigint`,
    [
      recordId,
      payload.title != null ? String(payload.title) : null,
      payload.description != null ? String(payload.description) : null,
      payload.event_date != null ? String(payload.event_date).slice(0, 10) : null,
      payload.event_time != null ? String(payload.event_time).slice(0, 8) : null,
      updatedAt.toISOString(),
      item.deviceId ?? null,
    ],
  );
  const record = await loadRecord('church_events', recordId);
  return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
}

async function pushSermonNoteItem(item: SyncPushItem, memberId: number): Promise<SyncPushResult> {
  const payload = item.payload ?? {};
  const updatedAt = parseUpdatedAt(payload);

  if (item.operation === 'create') {
    if (!item.clientId) {
      return {id: item.id, ok: false, status: 'rejected', error: 'clientId required'};
    }
    const existing = await query(
      `SELECT id::text FROM sermon_notes WHERE client_id = $1::uuid LIMIT 1`,
      [item.clientId],
    );
    if (existing.rows[0]) {
      const record = await loadRecord('sermon_notes', existing.rows[0].id);
      return {id: item.id, ok: true, serverId: existing.rows[0].id, status: 'conflict', conflict: true, record: record ?? undefined};
    }
    const insert = await query(
      `INSERT INTO sermon_notes (member_id, title, body, body_format, client_id, device_id, updated_at)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::timestamptz)
       RETURNING id::text`,
      [
        memberId,
        payload.title != null ? String(payload.title) : '',
        payload.body != null ? String(payload.body) : String(payload.content ?? ''),
        payload.body_format != null ? String(payload.body_format) : 'plain',
        item.clientId,
        item.deviceId ?? null,
        updatedAt.toISOString(),
      ],
    );
    const serverId = insert.rows[0]?.id as string;
    const record = await loadRecord('sermon_notes', serverId);
    return {id: item.id, ok: true, serverId, status: 'applied', record: record ?? undefined};
  }

  const recordId = item.recordId;
  if (!recordId) return {id: item.id, ok: false, status: 'rejected', error: 'recordId required'};

  const owned = await query(
    `SELECT id, member_id, updated_at FROM sermon_notes WHERE id = $1::bigint LIMIT 1`,
    [recordId],
  );
  if (!owned.rows[0]) return {id: item.id, ok: false, status: 'rejected', error: 'not found'};
  if (Number(owned.rows[0].member_id) !== memberId) {
    return {id: item.id, ok: false, status: 'rejected', error: 'forbidden'};
  }

  if (item.operation === 'delete') {
    await query(
      `UPDATE sermon_notes SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz WHERE id = $1::bigint`,
      [recordId, updatedAt.toISOString()],
    );
    const record = await loadRecord('sermon_notes', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
  }

  if (updatedAt.getTime() < new Date(owned.rows[0].updated_at).getTime()) {
    const record = await loadRecord('sermon_notes', recordId);
    return {id: item.id, ok: true, serverId: recordId, status: 'conflict', conflict: true, record: record ?? undefined};
  }

  await query(
    `UPDATE sermon_notes SET
       title = COALESCE($2, title),
       body = COALESCE($3, body),
       body_format = COALESCE($4, body_format),
       device_id = COALESCE($6, device_id),
       updated_at = $5::timestamptz
     WHERE id = $1::bigint`,
    [
      recordId,
      payload.title != null ? String(payload.title) : null,
      payload.body != null ? String(payload.body) : payload.content != null ? String(payload.content) : null,
      payload.body_format != null ? String(payload.body_format) : null,
      updatedAt.toISOString(),
      item.deviceId ?? null,
    ],
  );
  const record = await loadRecord('sermon_notes', recordId);
  return {id: item.id, ok: true, serverId: recordId, status: 'applied', record: record ?? undefined};
}

async function pushMemberItem(item: SyncPushItem, memberId: number): Promise<SyncPushResult> {
  // Members: only self profile fields via sync (no create/delete of accounts).
  if (item.operation !== 'update') {
    return {id: item.id, ok: false, status: 'rejected', error: 'members only support update'};
  }
  const recordId = item.recordId ?? String(memberId);
  if (String(recordId) !== String(memberId)) {
    return {id: item.id, ok: false, status: 'rejected', error: 'forbidden'};
  }
  const payload = item.payload ?? {};
  const updatedAt = parseUpdatedAt(payload);
  const current = await query(`SELECT updated_at FROM members WHERE id = $1 LIMIT 1`, [memberId]);
  if (!current.rows[0]) return {id: item.id, ok: false, status: 'rejected', error: 'not found'};
  if (updatedAt.getTime() < new Date(current.rows[0].updated_at).getTime()) {
    const record = await loadRecord('members', String(memberId));
    return {id: item.id, ok: true, serverId: String(memberId), status: 'conflict', conflict: true, record: record ?? undefined};
  }
  await query(
    `UPDATE members SET
       first_name = COALESCE($2, first_name),
       last_name = COALESCE($3, last_name),
       device_id = COALESCE($5, device_id),
       updated_at = $4::timestamptz
     WHERE id = $1`,
    [
      memberId,
      payload.first_name != null ? String(payload.first_name) : null,
      payload.last_name != null ? String(payload.last_name) : null,
      updatedAt.toISOString(),
      item.deviceId ?? null,
    ],
  );
  const record = await loadRecord('members', String(memberId));
  return {id: item.id, ok: true, serverId: String(memberId), status: 'applied', record: record ?? undefined};
}

export async function pushSyncBatch(
  items: SyncPushItem[],
  memberId: number,
): Promise<{results: SyncPushResult[]; serverTime: string}> {
  const results: SyncPushResult[] = [];
  for (const item of items.slice(0, 100)) {
    try {
      if (!isSyncTable(item.table)) {
        results.push({id: item.id, ok: false, status: 'rejected', error: `table ${item.table} not supported`});
        continue;
      }
      const cached = await getIdempotentResult(item.idempotencyKey, memberId);
      if (cached) {
        results.push({...cached, id: item.id});
        continue;
      }

      let result: SyncPushResult;
      if (item.table === 'songs') result = await pushSongItem(item, memberId);
      else if (item.table === 'church_events') result = await pushChurchEventItem(item, memberId);
      else if (item.table === 'sermon_notes') result = await pushSermonNoteItem(item, memberId);
      else result = await pushMemberItem(item, memberId);

      await saveIdempotentResult(item.idempotencyKey, memberId, item.table, result);
      results.push(result);
    } catch (e) {
      results.push({
        id: item.id,
        ok: false,
        status: 'rejected',
        error: e instanceof Error ? e.message : 'push failed',
      });
    }
  }
  return {results, serverTime: new Date().toISOString()};
}

export async function bootstrapSyncSnapshot(
  memberId: number,
): Promise<{
  songs: Record<string, unknown>[];
  member: Record<string, unknown> | null;
  church_events: Record<string, unknown>[];
  sermon_notes: Record<string, unknown>[];
}> {
  const songsRes = await query(
    `SELECT * FROM songs WHERE is_published = TRUE AND deleted_at IS NULL ORDER BY title ASC LIMIT 500`,
  );
  const memberRes = await query(
    `SELECT m.*, up.username
     FROM members m
     LEFT JOIN user_profiles up ON up.member_id = m.id
     WHERE m.id = $1 LIMIT 1`,
    [memberId],
  );
  const eventsRes = await query(
    `SELECT * FROM church_events WHERE deleted_at IS NULL AND COALESCE(is_active, TRUE) = TRUE
     ORDER BY event_date DESC, event_time DESC LIMIT 200`,
  );
  const notesRes = await query(
    `SELECT * FROM sermon_notes WHERE member_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 200`,
    [memberId],
  );
  return {
    songs: songsRes.rows.map(r => rowToSyncRecord('songs', r)),
    member: memberRes.rows[0] ? rowToSyncRecord('members', memberRes.rows[0]) : null,
    church_events: eventsRes.rows.map(r => rowToSyncRecord('church_events', r)),
    sermon_notes: notesRes.rows.map(r => rowToSyncRecord('sermon_notes', r)),
  };
}
