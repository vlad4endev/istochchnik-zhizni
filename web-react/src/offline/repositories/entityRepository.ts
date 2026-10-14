import { getOfflineDeviceId } from '../deviceId';
import { getStorageAdapter } from '../storage/adapter';
import type { OutboxRow, SyncOperation, SyncTableName } from '../types';
import { newClientId, newIdempotencyKey } from '../uuidv7';
import type { LocalRecord } from '../db/dexieDb';

export async function listEntities(table: SyncTableName): Promise<LocalRecord[]> {
  return getStorageAdapter().getAll(table);
}

export async function getEntity(table: SyncTableName, id: string): Promise<LocalRecord | undefined> {
  return getStorageAdapter().getById(table, id);
}

export async function upsertLocal(
  table: SyncTableName,
  data: Record<string, unknown>,
  operation: SyncOperation = 'update',
): Promise<LocalRecord> {
  const adapter = getStorageAdapter();
  const now = new Date().toISOString();
  const deviceId = getOfflineDeviceId();
  const clientId = String(data.client_id ?? newClientId());
  const id = String(data.id ?? clientId);

  const row: LocalRecord = {
    ...data,
    id,
    client_id: clientId,
    updated_at: now,
    deleted_at: data.deleted_at != null ? String(data.deleted_at) : null,
    version: Number(data.version ?? 1),
    sync_seq: data.sync_seq != null ? String(data.sync_seq) : null,
    device_id: deviceId,
    _syncStatus: 'local',
  };

  if (operation === 'delete') {
    row.deleted_at = now;
  }

  await adapter.put(table, row);

  const outbox: OutboxRow = {
    id: newIdempotencyKey(),
    tableName: table,
    operation,
    recordId: operation === 'create' ? null : id,
    clientId,
    payload: { ...row },
    idempotencyKey: newIdempotencyKey(),
    deviceId,
    attempts: 0,
    status: 'pending',
    lastError: null,
    createdAt: now,
  };
  await adapter.putOutbox(outbox);
  return row;
}

export async function applyRemoteRecord(table: SyncTableName, remote: Record<string, unknown>): Promise<void> {
  const adapter = getStorageAdapter();
  const id = String(remote.id);
  const existing = await adapter.getById(table, id);
  const remoteUpdated = new Date(String(remote.updated_at ?? 0)).getTime();
  const localUpdated = existing ? new Date(String(existing.updated_at ?? 0)).getTime() : 0;
  if (existing?._syncStatus === 'local' && localUpdated > remoteUpdated) {
    // Keep local pending edit; sync engine will push then pull.
    return;
  }
  await adapter.put(table, {
    ...remote,
    id,
    client_id: remote.client_id != null ? String(remote.client_id) : null,
    updated_at: String(remote.updated_at ?? new Date().toISOString()),
    deleted_at: remote.deleted_at != null ? String(remote.deleted_at) : null,
    version: Number(remote.version ?? 1),
    sync_seq: remote.sync_seq != null ? String(remote.sync_seq) : null,
    _syncStatus: 'synced',
  });
}
