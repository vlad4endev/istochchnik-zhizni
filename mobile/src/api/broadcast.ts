import { apiClient } from './client';

export type BroadcastPlatform = 'youtube' | 'rutube' | 'vk' | 'other';
export type BroadcastStatus = 'scheduled' | 'live' | 'finished';

export interface BroadcastData {
  id: number;
  title: string | null;
  description: string | null;
  starts_at: string | null;
  platform: BroadcastPlatform;
  stream_url: string | null;
  notify_members: boolean;
  is_public: boolean;
  status: BroadcastStatus;
  notification_sent: boolean;
}

export async function fetchActiveBroadcast(): Promise<BroadcastData | null> {
  const { data } = await apiClient.get<{ broadcast: BroadcastData | null }>(
    '/api/broadcasts/active',
  );
  return data.broadcast ?? null;
}

export async function fetchBroadcastHistory(limit = 30): Promise<BroadcastData[]> {
  const { data } = await apiClient.get<{ items: BroadcastData[] }>('/api/broadcasts/history', {
    params: { limit },
  });
  return data.items ?? [];
}
