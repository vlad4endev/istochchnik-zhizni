import {apiClient} from '../shared/apiClient';
import type {LocalTableName} from '../db/schema';
import type {SyncPullResponse} from '../shared/songbook/types';

export async function pullChangesFromServer(
  table: LocalTableName,
  since: string | null,
  cursor?: string | null,
): Promise<SyncPullResponse> {
  const params = new URLSearchParams({table});
  if (since) params.set('since', since);
  if (cursor) params.set('cursor', cursor);

  const {data} = await apiClient.get<SyncPullResponse>(`/api/sync/pull?${params.toString()}`);
  return data;
}
