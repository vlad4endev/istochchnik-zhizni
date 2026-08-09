import axios from 'axios';

import { apiClient } from '../../lib/apiClient';

import type { SongListItem } from '../songbook/api';
import type { MusicianNotesV1 } from './performNotes';

const STUDIO = '/api/studio';

export interface StudioVersionListItem {
  id: string;
  member_id: number;
  song_id: string;
  custom_content: string | null;
  custom_key: string | null;
  sheet_content: string | null;
  sheet_key: string | null;
  sheet_meta: StudioSheetMeta | null;
  updated_at: string;
  song_title: string;
  song_slug: string;
  song_is_published: boolean;
}

export type StudioSheetMeta = {
  bpm?: number | null;
  timeSignature?: string | null;
  composer?: string | null;
  arranger?: string | null;
  title?: string | null;
  generalNotes?: string | null;
  abcNotation?: string | null;
  sourceImageUrl?: string | null;
};

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
  sheet_content?: string | null;
  sheet_key?: string | null;
  sheet_meta?: StudioSheetMeta | null;
  /** Есть только у авторизованных запросов; в публичном API поля нет. */
  musician_notes?: MusicianNotesV1;
}

export async function fetchMyVersions(): Promise<StudioVersionListItem[]> {
  const { data } = await apiClient.get<StudioVersionListItem[]>(`${STUDIO}/versions`);
  return data;
}

/** Импортированные заготовки (песочница до публикации в каталог). */
export async function fetchImportedSandboxSongs(): Promise<SongListItem[]> {
  const { data } = await apiClient.get<SongListItem[]>(`${STUDIO}/imported-songs`);
  return data;
}

export async function fetchPublicCatalogSyncStatus(): Promise<{
  hidden: number;
  hiddenInProject?: number;
}> {
  const { data } = await apiClient.get<{ hidden: number; hiddenInProject?: number }>(
    `${STUDIO}/public-catalog-sync-status`,
  );
  return data;
}

export async function syncStudioToPublicCatalog(scope: 'mine' | 'project' = 'mine'): Promise<{
  published: number;
  contentSynced: number;
  songIds: number[];
}> {
  const { data } = await apiClient.post<{
    published: number;
    contentSynced: number;
    songIds: number[];
  }>(`${STUDIO}/sync-to-public-catalog`, { scope });
  return data;
}

/** Одна песня для редактора студии (те же правила, что список импорта + общий каталог). Требует сессию. */
export async function fetchStudioCatalogSong(songId: number): Promise<SongListItem> {
  const { data } = await apiClient.get<SongListItem>(`${STUDIO}/catalog-song/${songId}`);
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

/** Сохранить отдельную «версию с нотами» (не трогает custom_content). */
export async function saveSheetVersion(
  songId: number,
  body: {
    sheet_content: string;
    sheet_key?: string | null;
    sheet_meta?: StudioSheetMeta | null;
  },
): Promise<StudioVersionListItem> {
  const { data } = await apiClient.put<StudioVersionListItem>(`${STUDIO}/versions/${songId}/sheet`, body);
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
  const normalizedDate =
    event_date == null || event_date.trim() === ''
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(event_date.trim())
        ? event_date.trim()
        : null;
  if (event_date != null && event_date.trim() !== '' && normalizedDate === null) {
    throw new Error('Некорректная дата события');
  }
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

export async function patchSetlistItemMusicianNotes(
  setlistId: number,
  itemId: number,
  musician_notes: MusicianNotesV1,
): Promise<void> {
  await apiClient.patch(`${STUDIO}/setlists/${setlistId}/items/${itemId}`, { musician_notes });
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

export type ServicePlanSongUsageItem = {
  song_id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  usage_count: number;
  last_used_date: string | null;
  first_used_date: string | null;
};

export type ServicePlanSongRecentUsage = {
  song_id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  service_plan_id: number;
  service_date: string;
  plan_status: string;
  leader_name: string | null;
};

export type ServicePlanSongUsageReport = {
  period_months: number | null;
  stats: {
    services_with_songs: number;
    total_song_slots: number;
    unique_songs: number;
    avg_songs_per_service: number;
  };
  top_songs: ServicePlanSongUsageItem[];
  recent_usages: ServicePlanSongRecentUsage[];
  stale_songs: ServicePlanSongUsageItem[];
};

export type ServicePlanSongUsagePeriod = 3 | 6 | 12 | 'all';

export async function fetchServicePlanSongUsage(
  months: ServicePlanSongUsagePeriod = 12,
): Promise<ServicePlanSongUsageReport> {
  const param = months === 'all' ? 'all' : String(months);
  const { data } = await apiClient.get<ServicePlanSongUsageReport>(
    `${STUDIO}/service-plan-song-usage?months=${encodeURIComponent(param)}`,
  );
  return data;
}

export type ServicePlanSongPickResult = {
  plan: {
    id: number;
    service_date: string;
    start_time: string;
    template_name: string | null;
    status: string;
  };
  sermon: {
    topic: string;
    scripture: string;
    preacher_name: string | null;
  };
  song_blocks: Array<{
    block_id: number;
    order_index: number;
    title: string;
    current_song_id: number | null;
    current_song_title: string | null;
  }>;
  picks: Array<{
    block_id: number;
    order_index: number;
    song_id: number;
    song_title: string;
    song_number: number | null;
    default_key: string | null;
    reason: string;
  }>;
  ai_summary: string;
};

export async function pickServicePlanSongs(planId?: number): Promise<ServicePlanSongPickResult> {
  const { data } = await apiClient.post<ServicePlanSongPickResult>(
    `${STUDIO}/service-plan-song-pick`,
    { plan_id: planId ?? undefined },
    { timeout: 120_000 },
  );
  return data;
}

export async function applyServicePlanSongPicks(
  planId: number,
  assignments: Array<{ block_id: number; song_id: number }>,
): Promise<{ applied: number }> {
  const { data } = await apiClient.post<{ applied: number }>(`${STUDIO}/service-plan-song-pick/apply`, {
    plan_id: planId,
    assignments,
  });
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

export interface StudioSongTag {
  id: string;
  name: string;
  song_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchStudioSongTags(): Promise<StudioSongTag[]> {
  const { data } = await apiClient.get<StudioSongTag[]>(`${STUDIO}/tags`);
  return data;
}

export async function createStudioSongTag(name: string): Promise<StudioSongTag> {
  const { data } = await apiClient.post<StudioSongTag>(`${STUDIO}/tags`, { name });
  return data;
}

export async function renameStudioSongTag(id: number, name: string): Promise<StudioSongTag> {
  const { data } = await apiClient.patch<StudioSongTag>(`${STUDIO}/tags/${id}`, { name });
  return data;
}

export async function deleteStudioSongTag(
  id: number,
  removeFromSongs = true,
): Promise<{ deleted: true; name: string; songsUpdated: number }> {
  const { data } = await apiClient.delete<{ deleted: true; name: string; songsUpdated: number }>(
    `${STUDIO}/tags/${id}`,
    { params: { removeFromSongs: removeFromSongs ? '1' : '0' } },
  );
  return data;
}

export async function aiChordPlacement(content: string): Promise<{
  content: string;
  changedLines: number;
  totalChords: number;
}> {
  const { data } = await apiClient.post(`${STUDIO}/ai/chord-placement`, { content });
  return data as { content: string; changedLines: number; totalChords: number };
}

export async function aiSongCleanup(content: string): Promise<{ chordPro: string }> {
  const { data } = await apiClient.post<{ chordPro: string }>(`${STUDIO}/ai/song-cleanup`, { content });
  return data;
}
