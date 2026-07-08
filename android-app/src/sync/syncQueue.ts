import {v4 as uuidv4} from 'uuid';

import {
  database,
  getSyncMetadataCollection,
  getSyncQueueCollection,
} from '../db';
import type SyncQueueItem from '../db/models/SyncQueueItem';
import type {LocalTableName} from '../db/schema';
import {getOrCreateDeviceId} from '../shared/storage/secureStorage';
import type {SyncOperation} from '../shared/songbook/types';

export interface EnqueueParams {
  table: LocalTableName;
  operation: SyncOperation;
  recordId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
}

export async function enqueueSyncOperation(params: EnqueueParams): Promise<string> {
  const queueId = uuidv4();
  const deviceId = await getOrCreateDeviceId();
  const collection = getSyncQueueCollection();

  await database.write(async () => {
    await collection.create(item => {
      item.queueId = queueId;
      item.tableName = params.table;
      item.operation = params.operation;
      item.recordId = params.recordId ?? null;
      item.clientId = params.clientId ?? null;
      item.payloadJson = JSON.stringify(params.payload);
      item.deviceId = deviceId;
      item.createdAt = Date.now();
      item.attempts = 0;
      item.lastError = null;
    });
  });

  return queueId;
}

export async function listPendingQueueItems(): Promise<SyncQueueItem[]> {
  return getSyncQueueCollection().query().fetch();
}

export async function removeQueueItem(item: SyncQueueItem): Promise<void> {
  await database.write(async () => {
    await item.destroyPermanently();
  });
}

export async function markQueueItemFailed(item: SyncQueueItem, error: string): Promise<void> {
  await database.write(async () => {
    await item.update(row => {
      row.attempts = (row.attempts ?? 0) + 1;
      row.lastError = error;
    });
  });
}

export async function getLastSyncedAt(table: LocalTableName): Promise<number> {
  const rows = await getSyncMetadataCollection()
    .query()
    .fetch();
  const row = rows.find(r => r.tableName === table);
  return row?.lastSyncedAt ?? 0;
}

export async function setLastSyncedAt(table: LocalTableName, ts: number): Promise<void> {
  const collection = getSyncMetadataCollection();
  const existing = (await collection.query().fetch()).find(r => r.tableName === table);

  await database.write(async () => {
    if (existing) {
      await existing.update(row => {
        row.lastSyncedAt = ts;
      });
    } else {
      await collection.create(row => {
        row.tableName = table;
        row.lastSyncedAt = ts;
      });
    }
  });
}
