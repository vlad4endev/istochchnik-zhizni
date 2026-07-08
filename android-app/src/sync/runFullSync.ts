import {Q} from '@nozbe/watermelondb';

import {database, getMembersCollection, getSongsCollection} from '../db';
import type Song from '../db/models/Song';
import type Member from '../db/models/Member';
import type {LocalTableName} from '../db/schema';
import {pullChangesFromServer} from './pullChanges';
import {pushAllQueueItems} from './pushQueue';
import {logConflict} from './logConflict';
import {pickWinnerRecord, resolveConflict} from './resolveConflict';
import {
  getLastSyncedAt,
  listPendingQueueItems,
  markQueueItemFailed,
  removeQueueItem,
  setLastSyncedAt,
} from './syncQueue';
import {SYNC_TABLES} from './types';
import type {SyncPushItem} from '../shared/songbook/types';

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toMs(isoOrMs: unknown): number {
  if (typeof isoOrMs === 'number') return isoOrMs;
  if (typeof isoOrMs === 'string') {
    const ms = Date.parse(isoOrMs);
    return Number.isFinite(ms) ? ms : Date.now();
  }
  return Date.now();
}

async function applyRemoteSong(record: Record<string, unknown>): Promise<void> {
  const serverId = record.id != null ? String(record.id) : null;
  const clientId = typeof record.client_id === 'string' ? record.client_id : null;
  const deletedAt = record.deleted_at ? toMs(record.deleted_at) : null;
  const updatedAt = toMs(record.updated_at);
  const tagsJson = JSON.stringify(parseTags(record.tags));

  const collection = getSongsCollection();
  const existing = serverId
    ? await collection.query(Q.where('server_id', serverId)).fetch()
    : clientId
      ? await collection.query(Q.where('client_id', clientId)).fetch()
      : [];

  const applyFields = (row: Song) => {
    row.serverId = serverId;
    row.clientId = clientId;
    row.songNumber = typeof record.song_number === 'number' ? record.song_number : null;
    row.title = String(record.title ?? '');
    row.slug = String(record.slug ?? '');
    row.content = String(record.content ?? '');
    row.defaultKey = record.default_key != null ? String(record.default_key) : null;
    row.tempo = typeof record.tempo === 'number' ? record.tempo : null;
    row.timeSignature = record.time_signature != null ? String(record.time_signature) : null;
    row.tagsJson = tagsJson;
    row.isPublished = record.is_published !== false;
    row.updatedAt = updatedAt;
    row.deletedAt = deletedAt;
    row.syncedAt = Date.now();
  };

  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update(applyFields);
    } else {
      await collection.create(applyFields);
    }
  });
}

async function applyRemoteMember(record: Record<string, unknown>): Promise<void> {
  const serverId = record.id != null ? String(record.id) : null;
  if (!serverId) return;

  const collection = getMembersCollection();
  const existing = await collection.query(Q.where('server_id', serverId)).fetch();
  const updatedAt = toMs(record.updated_at);
  const deletedAt = record.deleted_at ? toMs(record.deleted_at) : null;

  const applyFields = (row: Member) => {
    row.serverId = serverId;
    row.firstName = String(record.first_name ?? '');
    row.lastName = String(record.last_name ?? '');
    row.username = record.username != null ? String(record.username) : null;
    row.appRole = record.app_role != null ? String(record.app_role) : null;
    row.updatedAt = updatedAt;
    row.deletedAt = deletedAt;
    row.syncedAt = Date.now();
  };

  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update(applyFields);
    } else {
      await collection.create(applyFields);
    }
  });
}

async function applyRemoteRecord(table: LocalTableName, record: Record<string, unknown>): Promise<void> {
  if (table === 'songs') {
    await applyRemoteSong(record);
  } else if (table === 'members') {
    await applyRemoteMember(record);
  }
}

export async function pullChangesForTable(table: LocalTableName): Promise<void> {
  const lastSynced = await getLastSyncedAt(table);
  const since = lastSynced > 0 ? new Date(lastSynced).toISOString() : null;

  let cursor: string | null = null;
  let serverTime = Date.now();

  do {
    const response = await pullChangesFromServer(table, since, cursor);
    for (const record of response.records) {
      await applyRemoteRecord(table, record);
    }
    cursor = response.nextCursor;
    serverTime = toMs(response.serverTime);
  } while (cursor);

  await setLastSyncedAt(table, serverTime);
}

export async function pushPendingQueue(): Promise<void> {
  const pending = await listPendingQueueItems();
  if (pending.length === 0) return;

  const response = await pushAllQueueItems(
    row => ({
      id: row.queueId,
      table: row.tableName as LocalTableName,
      operation: row.operation as SyncPushItem['operation'],
      recordId: row.recordId ?? undefined,
      clientId: row.clientId ?? undefined,
      payload: row.payload,
      createdAt: new Date(row.createdAt).toISOString(),
      deviceId: row.deviceId ?? undefined,
    }),
    pending.map(p => ({
      queueId: p.queueId,
      tableName: p.tableName,
      operation: p.operation,
      recordId: p.recordId,
      clientId: p.clientId,
      payload: p.payload,
      deviceId: p.deviceId,
      createdAt: p.createdAt,
    })),
  );

  const byId = new Map(pending.map(p => [p.queueId, p]));

  for (const result of response.results) {
    const item = byId.get(result.id);
    if (!item) continue;

    if (result.ok) {
      if (result.conflict) {
        const conflict = resolveConflict(
          item.tableName as LocalTableName,
          item.payload,
          {...item.payload, id: result.serverId},
        );
        await logConflict(conflict);
        const winner = pickWinnerRecord(conflict);
        await applyRemoteRecord(item.tableName as LocalTableName, winner);
      }
      await removeQueueItem(item);
    } else {
      await markQueueItemFailed(item, result.error ?? 'push failed');
    }
  }
}

export async function runFullSync(): Promise<void> {
  await pushPendingQueue();
  for (const table of SYNC_TABLES) {
    await pullChangesForTable(table);
  }
}
