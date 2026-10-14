import { apiClient } from '../../lib/apiClient';
import { getOfflineDeviceId } from '../deviceId';
import { applyRemoteRecord } from '../repositories/entityRepository';
import { getStorageAdapter } from '../storage/adapter';
import type { SyncPushItem, SyncPushResult, SyncTableName } from '../types';

const TABLES: SyncTableName[] = ['songs', 'members', 'church_events', 'sermon_notes'];
const BATCH = 25;

let running = false;
let backoffMs = 1000;

function jitter(ms: number): number {
  return Math.floor(ms * (0.7 + Math.random() * 0.6));
}

async function pushOutbox(): Promise<void> {
  const adapter = getStorageAdapter();
  const pending = await adapter.listOutboxPending(BATCH);
  if (pending.length === 0) return;

  const items: SyncPushItem[] = pending.map((row) => ({
    id: row.id,
    table: row.tableName,
    operation: row.operation,
    recordId: row.recordId ?? undefined,
    clientId: row.clientId ?? undefined,
    payload: row.payload,
    createdAt: row.createdAt,
    deviceId: row.deviceId || getOfflineDeviceId(),
    idempotencyKey: row.idempotencyKey,
  }));

  for (const row of pending) {
    await adapter.updateOutbox(row.id, { status: 'syncing' });
  }

  try {
    const { data } = await apiClient.post<{ results: SyncPushResult[] }>('/api/sync/push', { items });
    const byId = new Map((data.results ?? []).map((r) => [r.id, r]));
    for (const row of pending) {
      const result = byId.get(row.id);
      if (!result || !result.ok) {
        await adapter.updateOutbox(row.id, {
          status: 'error',
          attempts: row.attempts + 1,
          lastError: result?.error ?? 'push failed',
        });
        continue;
      }
      if (result.record) {
        await applyRemoteRecord(row.tableName, result.record);
      }
      await adapter.removeOutbox(row.id);
    }
    backoffMs = 1000;
  } catch (e) {
    for (const row of pending) {
      await adapter.updateOutbox(row.id, {
        status: 'error',
        attempts: row.attempts + 1,
        lastError: e instanceof Error ? e.message : 'network error',
      });
    }
    throw e;
  }
}

async function pullTable(table: SyncTableName): Promise<void> {
  const adapter = getStorageAdapter();
  const metaKey = `cursor:${table}`;
  let cursor = await adapter.getMeta(metaKey);
  let guard = 0;
  while (guard < 50) {
    guard += 1;
    const { data } = await apiClient.get<{
      records: Record<string, unknown>[];
      nextCursor: string | null;
    }>('/api/sync/pull', { params: { table, cursor: cursor ?? undefined } });
    const records = data.records ?? [];
    for (const rec of records) {
      await applyRemoteRecord(table, rec);
    }
    if (!data.nextCursor) break;
    cursor = data.nextCursor;
    await adapter.setMeta(metaKey, cursor);
  }
  if (cursor) await adapter.setMeta(metaKey, cursor);
}

export async function runSyncCycle(): Promise<void> {
  if (running) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  running = true;
  try {
    await pushOutbox();
    for (const table of TABLES) {
      await pullTable(table);
    }
    await getStorageAdapter().setMeta('last_sync_at', new Date().toISOString());
  } catch {
    backoffMs = Math.min(60_000, backoffMs * 2);
    window.setTimeout(() => {
      void runSyncCycle();
    }, jitter(backoffMs));
  } finally {
    running = false;
  }
}

export async function bootstrapOfflineSnapshot(): Promise<void> {
  const { data } = await apiClient.get<{
    songs: Record<string, unknown>[];
    member: Record<string, unknown> | null;
    church_events: Record<string, unknown>[];
    sermon_notes: Record<string, unknown>[];
  }>('/api/sync/bootstrap');
  for (const row of data.songs ?? []) await applyRemoteRecord('songs', row);
  if (data.member) await applyRemoteRecord('members', data.member);
  for (const row of data.church_events ?? []) await applyRemoteRecord('church_events', row);
  for (const row of data.sermon_notes ?? []) await applyRemoteRecord('sermon_notes', row);
}

let listenersBound = false;

export function bindSyncTriggers(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('online', () => void runSyncCycle());
  window.addEventListener('app:resume', () => void runSyncCycle());
  window.addEventListener('app:network-change', ((e: CustomEvent<{ connected: boolean }>) => {
    if (e.detail?.connected) void runSyncCycle();
  }) as EventListener);
  window.setInterval(() => void runSyncCycle(), 60_000);
}
