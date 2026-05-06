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

export type SongUsageSummary = {
  song_id: number;
  last_service_date: string | null;
  uses_total: number;
  uses_90d: number;
};

export type SongUsageTopRow = {
  song_id: number;
  title: string;
  default_key: string | null;
  last_service_date: string | null;
  uses: number;
};

const SONGS = '/api/songs';

export type SongListQuery = {
  q?: string;
  tempoMin?: number;
  tempoMax?: number;
  key?: string;
  tags?: string[];
  isPublished?: boolean;
};

function buildSongQuery(params?: SongListQuery): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  if (params.q?.trim()) sp.set('q', params.q.trim());
  if (params.tempoMin != null) sp.set('tempoMin', String(params.tempoMin));
  if (params.tempoMax != null) sp.set('tempoMax', String(params.tempoMax));
  if (params.key?.trim()) sp.set('key', params.key.trim());
  if (params.tags?.length) sp.set('tags', params.tags.join(','));
  if (params.isPublished !== undefined) sp.set('isPublished', String(params.isPublished));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function fetchSongs(params?: SongListQuery): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${SONGS}${buildSongQuery(params)}`);
  return data;
}

/** Для модераторов каталога: включает непубличные песни (например заготовки с тегом `нет_текста`). */
export async function fetchSongsForModeration(params?: SongListQuery): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${SONGS}/moderation${buildSongQuery(params)}`);
  return data;
}

export async function fetchSong(id: number): Promise<SongListItem> {
  const { data } = await apiClient.get<SongListItem>(`${SONGS}/${id}`);
  return data;
}

export async function fetchSongUsage(songId: number): Promise<SongUsageSummary> {
  const { data } = await apiClient.get<SongUsageSummary>(`${SONGS}/${songId}/usage`);
  return data;
}

export async function fetchTopSongUsages(params?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<SongUsageTopRow[]> {
  const sp = new URLSearchParams();
  if (params?.from?.trim()) sp.set('from', params.from.trim());
  if (params?.to?.trim()) sp.set('to', params.to.trim());
  if (params?.limit != null) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const { data } = await apiClient.get<SongUsageTopRow[]>(`${SONGS}/usage/top${qs ? `?${qs}` : ''}`);
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

export async function updateSong(
  id: number,
  body: Partial<{
    title: string;
    content: string;
    default_key: string | null;
    tempo: number | null;
    time_signature: string | null;
    tags: string[];
    is_published: boolean;
  }>,
): Promise<SongListItem> {
  const { data } = await apiClient.patch<SongListItem>(`${SONGS}/${id}`, body);
  return data;
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
  force?: boolean;
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

export async function aiSplitSongIntoBlocks(text: string): Promise<{ chordPro: string }> {
  const { data } = await apiClient.post<{ chordPro: string }>(`${SONGS}/ai/split-blocks`, { text });
  return data;
}

export type XlsxImportParsedSong = {
  external_id: string;
  song_number: number;
  title: string;
  table_of_contents: string;
  url_lyrics: string;
  url_chords: string;
  url_youtube: string | null;
};

export async function parseSongImportXlsxFile(file: File): Promise<{
  totalRows: number;
  parsedSongs: number;
  songs: XlsxImportParsedSong[];
  errors: Array<{ row: number; field: string; message: string; value?: string }>;
}> {
  const fd = new FormData();
  fd.set('file', file);
  const { data } = await apiClient.post('/api/song-import/parse', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as any;
}
