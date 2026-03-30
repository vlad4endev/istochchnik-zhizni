import { apiClient } from '../lib/apiClient';

export interface BroadcastData {
  rutube_embed_code: string | null;
}

export async function fetchBroadcastEmbed(): Promise<BroadcastData> {
  const { data } = await apiClient.get<BroadcastData>('/broadcast');
  return data;
}

export async function patchBroadcastEmbed(rutube_embed_code: string | null): Promise<BroadcastData> {
  const { data } = await apiClient.patch<BroadcastData>('/broadcast', { rutube_embed_code });
  return data;
}
