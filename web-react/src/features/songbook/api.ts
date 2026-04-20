import { apiClient } from '../../lib/apiClient';

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

const SONGS = '/api/songs';

export type SongListQuery = {
  q?: string;
  tempoMin?: number;
  tempoMax?: number;
  key?: string;
  tags?: string[];
};

function buildSongQuery(params?: SongListQuery): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.tempoMin != null) sp.set('tempoMin', String(params.tempoMin));
  if (params.tempoMax != null) sp.set('tempoMax', String(params.tempoMax));
  if (params.key?.trim()) sp.set('key', params.key.trim());
  if (params.tags?.length) sp.set('tags', params.tags.join(','));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function fetchSongs(params?: SongListQuery): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${SONGS}${buildSongQuery(params)}`);
  return data;
}

export async function fetchSong(id: number): Promise<SongListItem> {
  const { data } = await apiClient.get<SongListItem>(`${SONGS}/${id}`);
  return data;
}

export async function postFavorite(songId: number): Promise<void> {
  await apiClient.post(`${SONGS}/${songId}/favorite`);
}

export async function deleteFavorite(songId: number): Promise<void> {
  await apiClient.delete(`${SONGS}/${songId}/favorite`);
}

export async function forkInStudio(songId: number): Promise<void> {
  await apiClient.post(`/api/studio/fork/${songId}`, {});
}

export async function fetchVersionFlags(songIds: number[]): Promise<Record<number, boolean>> {
  if (songIds.length === 0) return {};
  const { data } = await apiClient.get<Record<string, boolean>>(
    `${SONGS}/version-flags?songIds=${songIds.join(',')}`,
  );
  const out: Record<number, boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    out[Number(k)] = Boolean(v);
  }
  return out;
}

export async function recordSongOpened(songId: number): Promise<void> {
  await apiClient.post(`${SONGS}/${songId}/open`);
}

export async function deleteSong(id: number): Promise<void> {
  await apiClient.delete(`${SONGS}/${id}`);
}

export async function createSong(body: {
  song_number?: number | null;
  title: string;
  content?: string;
  default_key?: string | null;
  tempo?: number | null;
  time_signature?: string | null;
  tags?: string[];
  is_published?: boolean;
}): Promise<SongListItem> {
  const { data } = await apiClient.post<SongListItem>(SONGS, body);
  return data;
}

export async function fetchYoutubeOembed(url: string): Promise<{ title: string; author: string }> {
  const { data } = await apiClient.get<{ title: string; author: string }>(
    `${SONGS}/youtube-oembed?url=${encodeURIComponent(url)}`,
  );
  return data;
}

/** Текст по публичной ссылке (прокси API, см. import-url на сервере). */
export async function fetchImportUrlText(url: string): Promise<{ text: string; contentType?: string }> {
  const { data } = await apiClient.get<{ text: string; contentType?: string }>(
    `${SONGS}/import-url?url=${encodeURIComponent(url)}`,
  );
  return data;
}
