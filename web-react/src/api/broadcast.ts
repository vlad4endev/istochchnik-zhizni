import { apiClient } from '../lib/apiClient';

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

export interface ActiveBroadcastResponse {
  broadcast: BroadcastData | null;
}

export interface BroadcastListResponse {
  items: BroadcastData[];
}

export interface LegacyBroadcastEmbedData {
  rutube_embed_code: string | null;
}

export async function fetchActiveBroadcast(): Promise<ActiveBroadcastResponse> {
  const { data } = await apiClient.get<ActiveBroadcastResponse>('/api/broadcasts/active');
  return data;
}

export async function patchBroadcast(id: number, payload: Partial<BroadcastData>): Promise<BroadcastData> {
  const { data } = await apiClient.patch<BroadcastData>(`/api/broadcasts/${id}`, payload);
  return data;
}

export async function createBroadcast(payload: Partial<BroadcastData>): Promise<BroadcastData> {
  const { data } = await apiClient.post<BroadcastData>('/api/broadcasts', payload);
  return data;
}

export async function fetchFinishedBroadcasts(limit = 10): Promise<BroadcastListResponse> {
  const { data } = await apiClient.get<BroadcastListResponse>('/api/broadcasts', {
    params: { status: 'finished', limit },
  });
  return data;
}

/** История записей для всех авторизованных участников. */
export async function fetchBroadcastHistory(limit = 30): Promise<BroadcastListResponse> {
  const { data } = await apiClient.get<BroadcastListResponse>('/api/broadcasts/history', {
    params: { limit },
  });
  return data;
}

export async function fetchBroadcastEmbed(): Promise<LegacyBroadcastEmbedData> {
  const { data } = await apiClient.get<LegacyBroadcastEmbedData>('/api/broadcast');
  return data;
}

export async function patchBroadcastEmbed(rutube_embed_code: string | null): Promise<LegacyBroadcastEmbedData> {
  const { data } = await apiClient.patch<LegacyBroadcastEmbedData>('/api/broadcast', { rutube_embed_code });
  return data;
}
