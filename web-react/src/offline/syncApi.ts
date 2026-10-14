import { apiClient } from '../lib/apiClient';

export type SyncTableName = 'songs' | 'members';

export type SyncPullResponse = {
  table: string;
  records: Record<string, unknown>[];
  nextCursor: string | null;
  serverTime: string;
};

export type SyncPushItem = {
  id: string;
  table: SyncTableName;
  operation: 'create' | 'update' | 'delete';
  recordId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  deviceId?: string;
};

export type SyncPushResult = {
  id: string;
  ok: boolean;
  serverId?: string;
  error?: string;
  conflict?: boolean;
};

export type SyncBootstrapResponse = {
  songs: Record<string, unknown>[];
  member: Record<string, unknown> | null;
  serverTime: string;
};

export async function pullSyncChanges(
  table: SyncTableName,
  since: string | null,
  cursor?: string | null,
): Promise<SyncPullResponse> {
  const { data } = await apiClient.get<SyncPullResponse>('/api/sync/pull', {
    params: {
      table,
      since: since || undefined,
      cursor: cursor || undefined,
    },
    silentErrorToast: true,
  });
  return data;
}

export async function pushSyncBatch(items: SyncPushItem[]): Promise<{
  results: SyncPushResult[];
  serverTime: string;
}> {
  const { data } = await apiClient.post<{ results: SyncPushResult[]; serverTime: string }>(
    '/api/sync/push',
    { items },
    { silentErrorToast: true },
  );
  return data;
}

export async function fetchSyncBootstrap(): Promise<SyncBootstrapResponse> {
  const { data } = await apiClient.get<SyncBootstrapResponse>('/api/sync/bootstrap', {
    silentErrorToast: true,
  });
  return data;
}
