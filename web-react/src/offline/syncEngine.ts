import { offlineDb, getOrCreateDeviceId } from './db';
import {
  fetchSyncBootstrap,
  pullSyncChanges,
  pushSyncBatch,
  type SyncPushItem,
  type SyncTableName,
} from './syncApi';
import { syncRecordToOfflineSong, upsertOfflineSong } from './songRepository';

export type OfflineSyncStatus = {
  phase: 'idle' | 'syncing' | 'error';
  lastSuccessAt: number | null;
  lastError: string | null;
  songCount: number;
  pendingCount: number;
};

type Listener = (s: OfflineSyncStatus) => void;

let status: OfflineSyncStatus = {
  phase: 'idle',
  lastSuccessAt: null,
  lastError: null,
  songCount: 0,
  pendingCount: 0,
};

const listeners = new Set<Listener>();
let syncInFlight: Promise<void> | null = null;

function emit(): void {
  for (const l of listeners) l(status);
}

export function getOfflineSyncStatus(): OfflineSyncStatus {
  return status;
}

export function subscribeOfflineSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => listeners.delete(listener);
}

async function refreshCounts(): Promise<void> {
  const [songCount, pendingCount] = await Promise.all([
    offlineDb.songs.filter((s) => !s.deletedAt && s.isPublished).count(),
    offlineDb.syncQueue.count(),
  ]);
  status = { ...status, songCount, pendingCount };
  emit();
}

async function getLastSyncedAt(table: SyncTableName): Promise<number> {
  const row = await offlineDb.syncMeta.get(table);
  return row?.lastSyncedAt ?? 0;
}

async function setLastSyncedAt(table: SyncTableName, ts: number): Promise<void> {
  await offlineDb.syncMeta.put({ table, lastSyncedAt: ts });
}

async function applyMember(record: Record<string, unknown>): Promise<void> {
  const id = record.id != null ? String(record.id) : null;
  if (!id) return;
  await offlineDb.members.put({
    id,
    firstName: String(record.first_name ?? ''),
    lastName: String(record.last_name ?? ''),
    username: record.username != null ? String(record.username) : null,
    appRole: record.app_role != null ? String(record.app_role) : null,
    updatedAt:
      typeof record.updated_at === 'string' || typeof record.updated_at === 'number'
        ? Date.parse(String(record.updated_at)) || Date.now()
        : Date.now(),
    deletedAt: record.deleted_at
      ? Date.parse(String(record.deleted_at)) || Date.now()
      : null,
  });
}

async function pullTable(table: SyncTableName): Promise<void> {
  const last = await getLastSyncedAt(table);
  const since = last > 0 ? new Date(last).toISOString() : null;
  let cursor: string | null = null;
  let serverTime = Date.now();

  do {
    const page = await pullSyncChanges(table, since, cursor);
    for (const record of page.records) {
      if (table === 'songs') {
        await upsertOfflineSong(syncRecordToOfflineSong(record));
      } else {
        await applyMember(record);
      }
    }
    cursor = page.nextCursor;
    const parsed = Date.parse(page.serverTime);
    serverTime = Number.isFinite(parsed) ? parsed : Date.now();
  } while (cursor);

  await setLastSyncedAt(table, serverTime);
}

async function bootstrapIfNeeded(): Promise<void> {
  const last = await getLastSyncedAt('songs');
  if (last > 0) return;

  const snapshot = await fetchSyncBootstrap();
  for (const song of snapshot.songs ?? []) {
    await upsertOfflineSong(syncRecordToOfflineSong(song));
  }
  if (snapshot.member) {
    await applyMember(snapshot.member);
  }
  const parsed = Date.parse(snapshot.serverTime);
  const ts = Number.isFinite(parsed) ? parsed : Date.now();
  await setLastSyncedAt('songs', ts);
  await setLastSyncedAt('members', ts);
}

async function pushQueue(): Promise<void> {
  const pending = await offlineDb.syncQueue.orderBy('createdAt').toArray();
  if (pending.length === 0) return;

  const items: SyncPushItem[] = pending.map((row) => ({
    id: row.queueId,
    table: row.table,
    operation: row.operation,
    recordId: row.recordId ?? undefined,
    clientId: row.clientId ?? undefined,
    payload: row.payload,
    createdAt: new Date(row.createdAt).toISOString(),
    deviceId: row.deviceId ?? getOrCreateDeviceId(),
  }));

  const { results } = await pushSyncBatch(items);
  const byId = new Map(pending.map((p) => [p.queueId, p]));

  for (const result of results) {
    const item = byId.get(result.id);
    if (!item || item.id == null) continue;
    if (result.ok) {
      if (result.serverId && item.clientId) {
        const local = await offlineDb.songs.where('clientId').equals(item.clientId).first();
        if (local) {
          await offlineDb.songs.delete(local.id);
          await offlineDb.songs.put({
            ...local,
            id: String(result.serverId),
            serverId: String(result.serverId),
            syncedAt: Date.now(),
            isPublished: local.isPublished || true,
          });
        }
      }
      await offlineDb.syncQueue.delete(item.id);
    } else {
      await offlineDb.syncQueue.update(item.id, {
        attempts: (item.attempts ?? 0) + 1,
        lastError: result.error ?? 'push failed',
      });
    }
  }
}

export async function runOfflineSync(): Promise<void> {
  if (syncInFlight) return syncInFlight;

  status = { ...status, phase: 'syncing', lastError: null };
  emit();

  syncInFlight = (async () => {
    try {
      await pushQueue();
      await bootstrapIfNeeded();
      await pullTable('songs');
      await pullTable('members');
      await refreshCounts();
      status = {
        ...status,
        phase: 'idle',
        lastSuccessAt: Date.now(),
        lastError: null,
      };
      emit();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка синхронизации';
      status = { ...status, phase: 'error', lastError: message };
      emit();
      await refreshCounts();
      throw err;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Fire-and-forget sync used by UI hooks. */
export function triggerOfflineSync(): void {
  void runOfflineSync().catch((err) => {
    console.warn('[offline-sync]', err);
  });
}
