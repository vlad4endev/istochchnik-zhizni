import axios from 'axios';

import { apiClient } from '../../lib/apiClient';

import type { SongListItem } from '../songbook/api';

const STUDIO = '/api/studio';

export interface StudioVersionListItem {
  id: string;
  member_id: number;
  song_id: string;
  custom_content: string | null;
  custom_key: string | null;
  updated_at: string;
  song_title: string;
  song_slug: string;
}

export interface StudioDraft {
  id: string;
  member_id: number;
  title: string;
  content: string;
  updated_at: string;
}

export interface SetlistRow {
  id: string;
  member_id: number;
  title: string;
  event_date: string | null;
  is_public: boolean;
  share_token: string;
  created_at: string;
  updated_at: string;
}

export interface SetlistItemRow {
  id: string;
  setlist_id: string;
  position: number;
  song_id: string;
  studio_version_id: string | null;
  song: SongListItem;
  effective_key: string | null;
  effective_content: string;
  effective_content_preview: string;
}

export async function fetchMyVersions(): Promise<StudioVersionListItem[]> {
  const { data } = await apiClient.get<StudioVersionListItem[]>(`${STUDIO}/versions`);
  return data;
}

export async function fetchVersionForSong(songId: number) {
  try {
    const { data } = await apiClient.get(`${STUDIO}/versions/song/${songId}`);
    return data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      return null;
    }
    throw e;
  }
}

export async function saveVersion(
  songId: number,
  body: { custom_content?: string | null; custom_key?: string | null },
) {
  const { data } = await apiClient.put(`${STUDIO}/versions/${songId}`, body);
  return data;
}

export async function fetchDrafts(): Promise<StudioDraft[]> {
  const { data } = await apiClient.get<StudioDraft[]>(`${STUDIO}/drafts`);
  return data;
}

export async function createDraft(title: string, content: string): Promise<StudioDraft> {
  const { data } = await apiClient.post<StudioDraft>(`${STUDIO}/drafts`, { title, content });
  return data;
}

export async function updateDraft(
  id: number,
  body: Partial<{ title: string; content: string }>,
): Promise<StudioDraft> {
  const { data } = await apiClient.patch<StudioDraft>(`${STUDIO}/drafts/${id}`, body);
  return data;
}

export async function deleteDraft(id: number): Promise<void> {
  await apiClient.delete(`${STUDIO}/drafts/${id}`);
}

export async function fetchSetlists(): Promise<SetlistRow[]> {
  const { data } = await apiClient.get<SetlistRow[]>(`${STUDIO}/setlists`);
  return data;
}

export async function createSetlist(title: string, event_date: string | null): Promise<SetlistRow> {
  const { data } = await apiClient.post<SetlistRow>(`${STUDIO}/setlists`, { title, event_date });
  return data;
}

export async function deleteSetlist(id: number): Promise<void> {
  await apiClient.delete(`${STUDIO}/setlists/${id}`);
}

export async function fetchSetlistItems(setlistId: number): Promise<SetlistItemRow[]> {
  const { data } = await apiClient.get<SetlistItemRow[]>(`${STUDIO}/setlists/${setlistId}/items`);
  return data;
}

export async function addSetlistItem(
  setlistId: number,
  song_id: number,
  studio_version_id: number | null,
): Promise<void> {
  await apiClient.post(`${STUDIO}/setlists/${setlistId}/items`, {
    song_id,
    studio_version_id,
  });
}

export async function removeSetlistItem(setlistId: number, itemId: number): Promise<void> {
  await apiClient.delete(`${STUDIO}/setlists/${setlistId}/items/${itemId}`);
}

export async function reorderSetlistItems(setlistId: number, ordered_item_ids: number[]): Promise<void> {
  await apiClient.post(`${STUDIO}/setlists/${setlistId}/reorder`, { ordered_item_ids });
}

export async function fetchPerformance(setlistId: number) {
  const { data } = await apiClient.get<{
    setlist: SetlistRow;
    items: SetlistItemRow[];
  }>(`${STUDIO}/setlists/${setlistId}/performance`);
  return data;
}

export async function fetchRecentSongs(limit = 8): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${STUDIO}/recent-songs?limit=${limit}`);
  return data;
}

export async function patchSetlist(
  id: number,
  body: Partial<{ title: string; event_date: string | null; is_public: boolean }>,
): Promise<SetlistRow> {
  const { data } = await apiClient.patch<SetlistRow>(`${STUDIO}/setlists/${id}`, body);
  return data;
}

export async function fetchPublicSetlist(token: string): Promise<{
  setlist: SetlistRow;
  items: SetlistItemRow[];
}> {
  const { data } = await apiClient.get<{
    setlist: SetlistRow;
    items: SetlistItemRow[];
  }>(`/api/public/setlists/${encodeURIComponent(token)}`);
  return data;
}

export async function fetchInstrumentSettings(): Promise<{
  member_id: number;
  settings: Record<string, unknown>;
  updated_at: string;
}> {
  const { data } = await apiClient.get(`${STUDIO}/instruments`);
  return data;
}

export async function patchInstrumentSettings(patch: Record<string, unknown>): Promise<void> {
  await apiClient.patch(`${STUDIO}/instruments`, patch);
}
