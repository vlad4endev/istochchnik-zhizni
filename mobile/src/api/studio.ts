import type { SongListItem } from './songs';
import { apiClient } from './client';
import axios from 'axios';
import type { MusicianNotesV1 } from '../lib/performNotes';

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
  song_is_published: boolean;
}

export interface StudioVersionRow {
  id: string;
  member_id: number;
  song_id: string;
  custom_content: string | null;
  custom_key: string | null;
  sheet_content?: string | null;
  sheet_key?: string | null;
  sheet_meta?: Record<string, unknown> | null;
  updated_at: string;
}

export interface SetlistRow {
  id: string;
  member_id: number;
  title: string;
  event_date: string | null;
  is_public: boolean;
  share_token: string;
  source_service_plan_id: number | null;
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
  musician_notes?: MusicianNotesV1 | null;
}

export async function fetchMyVersions(): Promise<StudioVersionListItem[]> {
  const { data } = await apiClient.get<StudioVersionListItem[]>(`${STUDIO}/versions`);
  return data ?? [];
}

export async function fetchVersionForSong(songId: number): Promise<StudioVersionRow | null> {
  try {
    const { data } = await apiClient.get<StudioVersionRow | null>(
      `${STUDIO}/versions/song/${songId}`,
    );
    return data ?? null;
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
): Promise<StudioVersionRow> {
  const { data } = await apiClient.put<StudioVersionRow>(`${STUDIO}/versions/${songId}`, body);
  return data;
}

export async function fetchRecentSongs(limit = 12): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${STUDIO}/recent-songs`, {
    params: { limit },
  });
  return data ?? [];
}

export async function fetchSetlists(): Promise<SetlistRow[]> {
  const { data } = await apiClient.get<SetlistRow[]>(`${STUDIO}/setlists`);
  return data ?? [];
}

export async function createSetlist(title: string, eventDate: string | null): Promise<SetlistRow> {
  const normalizedDate =
    eventDate == null || eventDate.trim() === ''
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim())
        ? eventDate.trim()
        : null;
  const { data } = await apiClient.post<SetlistRow>(`${STUDIO}/setlists`, {
    title,
    event_date: normalizedDate,
  });
  return data;
}

export async function deleteSetlist(id: number): Promise<void> {
  await apiClient.delete(`${STUDIO}/setlists/${id}`);
}

export async function fetchSetlistItems(setlistId: number): Promise<SetlistItemRow[]> {
  const { data } = await apiClient.get<SetlistItemRow[]>(`${STUDIO}/setlists/${setlistId}/items`);
  return data ?? [];
}

export async function fetchPerformance(setlistId: number): Promise<{
  setlist: SetlistRow;
  items: SetlistItemRow[];
}> {
  const { data } = await apiClient.get<{ setlist: SetlistRow; items: SetlistItemRow[] }>(
    `${STUDIO}/setlists/${setlistId}/performance`,
  );
  return data;
}

export async function addSetlistItem(
  setlistId: number,
  songId: number,
  studioVersionId: number | null = null,
): Promise<void> {
  await apiClient.post(`${STUDIO}/setlists/${setlistId}/items`, {
    song_id: songId,
    studio_version_id: studioVersionId,
  });
}

export async function removeSetlistItem(setlistId: number, itemId: number): Promise<void> {
  await apiClient.delete(`${STUDIO}/setlists/${setlistId}/items/${itemId}`);
}

export async function patchSetlistItemMusicianNotes(
  setlistId: number,
  itemId: number,
  musician_notes: MusicianNotesV1,
): Promise<void> {
  await apiClient.patch(`${STUDIO}/setlists/${setlistId}/items/${itemId}`, { musician_notes });
}

export async function reorderSetlistItems(
  setlistId: number,
  orderedItemIds: number[],
): Promise<void> {
  await apiClient.post(`${STUDIO}/setlists/${setlistId}/reorder`, {
    ordered_item_ids: orderedItemIds,
  });
}

/** LLM-запросы дольше дефолтного timeout apiClient (25s). */
const AI_REQUEST_TIMEOUT_MS = 120_000;

export async function aiSongCleanup(content: string): Promise<{ chordPro: string }> {
  const { data } = await apiClient.post<{ chordPro: string }>(
    `${STUDIO}/ai/song-cleanup`,
    { content },
    { timeout: AI_REQUEST_TIMEOUT_MS },
  );
  return data;
}

export async function aiChordPlacement(content: string): Promise<{
  content: string;
  changedLines: number;
  totalChords: number;
}> {
  const { data } = await apiClient.post<{
    content: string;
    changedLines: number;
    totalChords: number;
  }>(`${STUDIO}/ai/chord-placement`, { content }, { timeout: AI_REQUEST_TIMEOUT_MS });
  return data;
}
