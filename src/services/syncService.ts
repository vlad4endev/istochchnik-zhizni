import {query} from '../config/db';

export type SyncTableName = 'songs' | 'members';

export interface SyncPullOptions {
  table: SyncTableName;
  since: string | null;
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
}

export interface SyncPushResult {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  conflict?: boolean;
}

const PULL_LIMIT = 100;

function parseSince(since: string | null): Date | null {
  if (!since) return null;
  const d = new Date(since);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseCursor(cursor: string | null): number {
  if (!cursor) return 0;
  const n = Number(cursor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function rowToSyncRecord(table: SyncTableName, row: Record<string, unknown>): Record<string, unknown> {
  if (table === 'songs') {
    return {
      id: String(row.id),
      client_id: row.client_id ?? null,
      song_number: row.song_number ?? null,
      title: row.title,
      slug: row.slug,
      content: row.content,
      default_key: row.default_key ?? null,
      tempo: row.tempo ?? null,
      time_signature: row.time_signature ?? null,
      tags: row.tags ?? [],
      is_published: row.is_published,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at ?? null,
      created_by_device: row.created_by_device ?? null,
    };
  }

  return {
    id: String(row.id),
    first_name: row.first_name,
    last_name: row.last_name,
    username: row.username ?? null,
    app_role: row.app_role ?? null,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

export async function pullSyncChanges(opts: SyncPullOptions): Promise<{
  records: Record<string, unknown>[];
  nextCursor: string | null;
  serverTime: string;
}> {
  const since = parseSince(opts.since);
  const offset = parseCursor(opts.cursor);
  const limit = opts.limit ?? PULL_LIMIT;

  if (opts.table === 'songs') {
    const params: unknown[] = [];
    let where = 'TRUE';
    if (since) {
      params.push(since.toISOString());
      where = `updated_at > $${params.length}::timestamptz`;
    }
    params.push(limit, offset);
    const res = await query(
      `SELECT * FROM songs WHERE ${where} ORDER BY updated_at ASC, id ASC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const records = res.rows.map(r => rowToSyncRecord('songs', r));
    const nextCursor = records.length >= limit ? String(offset + limit) : null;
    return {records, nextCursor, serverTime: new Date().toISOString()};
  }

  const params: unknown[] = [];
  let where = 'TRUE';
  if (since) {
    params.push(since.toISOString());
    where = `updated_at > $${params.length}::timestamptz`;
  }
  params.push(limit, offset);
  const res = await query(
    `SELECT m.id, m.first_name, m.last_name, m.app_role, m.updated_at, m.deleted_at,
            up.username
     FROM members m
     LEFT JOIN user_profiles up ON up.member_id = m.id
     WHERE ${where.replace(/\bupdated_at\b/g, 'm.updated_at')}
     ORDER BY m.updated_at ASC, m.id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const records = res.rows.map(r => rowToSyncRecord('members', r));
  const nextCursor = records.length >= limit ? String(offset + limit) : null;
  return {records, nextCursor, serverTime: new Date().toISOString()};
}

function parseUpdatedAt(payload: Record<string, unknown>): Date {
  const raw = payload.updated_at ?? payload.deleted_at;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    if (Number.isFinite(d.getTime())) return d;
  }
  return new Date();
}

async function pushSongItem(item: SyncPushItem, memberId: number): Promise<SyncPushResult> {
  const payload = item.payload ?? {};
  const updatedAt = parseUpdatedAt(payload);

  if (item.operation === 'create') {
    if (!item.clientId) {
      return {id: item.id, ok: false, error: 'clientId required for create'};
    }
    const existing = await query(
      `SELECT id::text FROM songs WHERE client_id = $1::uuid LIMIT 1`,
      [item.clientId],
    );
    if (existing.rows[0]) {
      return {id: item.id, ok: true, serverId: existing.rows[0].id, conflict: true};
    }

    const title = String(payload.title ?? '').trim() || 'Без названия';
    const slug = String(payload.slug ?? '').trim() || `song-${item.clientId.slice(0, 8)}`;
    const insert = await query(
      `INSERT INTO songs (
         title, slug, content, default_key, tags, is_published,
         client_id, created_by_member_id, created_by_device, updated_at
       ) VALUES ($1, $2, $3, $4, '{}'::text[], FALSE, $5::uuid, $6, $7, $8)
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
    return {id: item.id, ok: true, serverId: insert.rows[0]?.id};
  }

  const recordId = item.recordId ?? null;
  if (!recordId) {
    return {id: item.id, ok: false, error: 'recordId required'};
  }

  if (item.operation === 'delete') {
    await query(
      `UPDATE songs SET deleted_at = $2::timestamptz, updated_at = $2::timestamptz WHERE id = $1::bigint`,
      [recordId, updatedAt.toISOString()],
    );
    return {id: item.id, ok: true, serverId: recordId};
  }

  const current = await query(
    `SELECT updated_at FROM songs WHERE id = $1::bigint LIMIT 1`,
    [recordId],
  );
  if (!current.rows[0]) {
    return {id: item.id, ok: false, error: 'not found'};
  }
  const serverTs = new Date(current.rows[0].updated_at).getTime();
  const clientTs = updatedAt.getTime();
  if (clientTs < serverTs) {
    return {id: item.id, ok: true, serverId: recordId, conflict: true};
  }

  await query(
    `UPDATE songs SET
       title = COALESCE($2, title),
       slug = COALESCE($3, slug),
       content = COALESCE($4, content),
       default_key = COALESCE($5, default_key),
       updated_at = $6::timestamptz
     WHERE id = $1::bigint`,
    [
      recordId,
      payload.title != null ? String(payload.title) : null,
      payload.slug != null ? String(payload.slug) : null,
      payload.content != null ? String(payload.content) : null,
      payload.default_key != null ? String(payload.default_key) : null,
      updatedAt.toISOString(),
    ],
  );
  return {id: item.id, ok: true, serverId: recordId};
}

export async function pushSyncBatch(
  items: SyncPushItem[],
  memberId: number,
): Promise<{results: SyncPushResult[]; serverTime: string}> {
  const results: SyncPushResult[] = [];
  for (const item of items) {
    try {
      if (item.table === 'songs') {
        results.push(await pushSongItem(item, memberId));
      } else {
        results.push({id: item.id, ok: false, error: `table ${item.table} push not implemented`});
      }
    } catch (e) {
      results.push({
        id: item.id,
        ok: false,
        error: e instanceof Error ? e.message : 'push failed',
      });
    }
  }
  return {results, serverTime: new Date().toISOString()};
}

export async function bootstrapSyncSnapshot(
  memberId: number,
): Promise<{songs: Record<string, unknown>[]; member: Record<string, unknown> | null}> {
  const songsRes = await query(
    `SELECT * FROM songs WHERE is_published = TRUE AND deleted_at IS NULL ORDER BY title ASC LIMIT 500`,
  );
  const memberRes = await query(
    `SELECT m.id, m.first_name, m.last_name, m.app_role, m.updated_at, m.deleted_at,
            up.username
     FROM members m
     LEFT JOIN user_profiles up ON up.member_id = m.id
     WHERE m.id = $1 LIMIT 1`,
    [memberId],
  );
  return {
    songs: songsRes.rows.map(r => rowToSyncRecord('songs', r)),
    member: memberRes.rows[0] ? rowToSyncRecord('members', memberRes.rows[0]) : null,
  };
}
