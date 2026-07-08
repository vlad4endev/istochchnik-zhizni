import {apiClient} from '../shared/apiClient';
import type {SyncPushItem, SyncPushResponse} from '../shared/songbook/types';

const BATCH_SIZE = 25;

export async function pushQueueToServer(items: SyncPushItem[]): Promise<SyncPushResponse> {
  if (items.length === 0) {
    return {results: [], serverTime: new Date().toISOString()};
  }

  const batch = items.slice(0, BATCH_SIZE);
  const {data} = await apiClient.post<SyncPushResponse>('/api/sync/push', {items: batch});
  return data;
}

export async function pushAllQueueItems(
  mapItem: (row: {
    queueId: string;
    tableName: string;
    operation: string;
    recordId: string | null;
    clientId: string | null;
    payload: Record<string, unknown>;
    deviceId: string | null;
    createdAt: number;
  }) => SyncPushItem,
  pending: Array<Parameters<typeof mapItem>[0]>,
): Promise<SyncPushResponse> {
  const items = pending.map(mapItem);
  return pushQueueToServer(items);
}
