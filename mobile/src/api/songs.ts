import { apiClient } from './client';

export interface SongListItem {
  id: string;
  song_number: number | null;
  title: string;
  slug: string;
  content: string;
  default_key: string | null;
  tempo: number | null;
  time_signature: string | null;
  tags: string[];
  is_published: boolean;
  has_studio_version?: boolean;
  is_favorite?: boolean;
}

export async function fetchSongs(q?: string): Promise<SongListItem[]> {
  const params = q?.trim() ? { q: q.trim() } : undefined;
  const { data } = await apiClient.get<SongListItem[]>('/api/songs', { params });
  return Array.isArray(data) ? data : [];
}

export async function fetchSong(id: number): Promise<SongListItem> {
  const { data } = await apiClient.get<SongListItem>(`/api/songs/${id}`);
  return data;
}
