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

export type {
  RecognizedSong,
  RecognizedSection,
  RecognizedSectionType,
} from '../lib/sheetMusicTypes';

/** Распознать партитуру с фото (до ~3 мин). Поле формы: photo. */
export async function aiRecognizeSheetMusic(asset: {
  uri: string;
  name: string;
  type: string;
}): Promise<import('../lib/sheetMusicTypes').RecognizedSong> {
  const form = new FormData();
  form.append('photo', {
    uri: asset.uri,
    name: asset.name,
    type: asset.type,
  } as unknown as Blob);
  const { data } = await apiClient.post<import('../lib/sheetMusicTypes').RecognizedSong>(
    '/api/songs/ai/recognize-sheet',
    form,
    {
      timeout: 180_000,
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return data;
}
