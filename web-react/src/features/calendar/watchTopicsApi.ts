import { apiClient } from '../../lib/apiClient';
import type {
  PrayerWatchTopic,
  PrayerWatchTopicDayAssignment,
} from '../../types';

const BASE = '/api/calendar/watch-topics';

export interface PrayerWatchTopicRosterEntry {
  id: number;
  roster_index: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PrayerWatchTopicRosterSnapshot {
  anchor_date: string;
  start_date: string;
  total: number;
  today_index: number;
  today_topic_id: number | null;
  cycle_index: number;
  has_custom_roster_order: boolean;
  roster: PrayerWatchTopicRosterEntry[];
}

export async function fetchWatchTopicsCanEdit(): Promise<boolean> {
  const { data } = await apiClient.get<{ can_edit?: boolean }>(`${BASE}/can-edit`);
  return Boolean(data?.can_edit);
}

export async function fetchWatchTopics(includeInactive = true): Promise<PrayerWatchTopic[]> {
  const { data } = await apiClient.get<PrayerWatchTopic[]>(BASE, {
    params: { include_inactive: includeInactive ? '1' : '0' },
  });
  return Array.isArray(data) ? data : [];
}

export async function createWatchTopicApi(body: {
  title: string;
  bible_verse?: string | null;
  prayer_points?: string | null;
  notes?: string | null;
  is_active?: boolean;
}): Promise<PrayerWatchTopic> {
  const { data } = await apiClient.post<PrayerWatchTopic>(BASE, body);
  return data;
}

export async function updateWatchTopicApi(
  id: number,
  body: Partial<{
    title: string;
    bible_verse: string | null;
    prayer_points: string | null;
    notes: string | null;
    is_active: boolean;
    sort_order: number;
  }>,
): Promise<PrayerWatchTopic> {
  const { data } = await apiClient.patch<PrayerWatchTopic>(`${BASE}/${id}`, body);
  return data;
}

export async function deleteWatchTopicApi(id: number): Promise<void> {
  await apiClient.delete(`${BASE}/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function fetchWatchTopicForDate(date: string): Promise<PrayerWatchTopicDayAssignment> {
  const { data } = await apiClient.get<PrayerWatchTopicDayAssignment>(`${BASE}/${date}`);
  return data;
}

export async function fetchWatchTopicWeek(
  week: 'current' | 'next' = 'current',
): Promise<{ days: PrayerWatchTopicDayAssignment[]; week: string }> {
  const { data } = await apiClient.get<{ days: PrayerWatchTopicDayAssignment[]; week: string }>(
    `${BASE}/week`,
    { params: { week } },
  );
  return {
    days: Array.isArray(data?.days) ? data.days : [],
    week: data?.week ?? week,
  };
}

export async function fetchWatchTopicRoster(date: string): Promise<PrayerWatchTopicRosterSnapshot> {
  const { data } = await apiClient.get<PrayerWatchTopicRosterSnapshot>(`${BASE}/roster`, {
    params: { date },
  });
  return data;
}

export async function saveWatchTopicRosterOrderApi(body: {
  anchor_date: string;
  ordered_topic_ids: number[];
}): Promise<{ cycle_index: number }> {
  const { data } = await apiClient.put<{ cycle_index: number }>(`${BASE}/roster-order`, body);
  return data;
}

export async function clearWatchTopicRosterOrderApi(date?: string): Promise<void> {
  await apiClient.delete(`${BASE}/roster-order`, {
    params: date ? { date } : undefined,
  });
}

export async function startWatchTopicCycleApi(start_date: string): Promise<{ start_date: string }> {
  const { data } = await apiClient.post<{ start_date: string }>(`${BASE}/cycle/start`, {
    start_date,
  });
  return data;
}

export async function anchorWatchTopicApi(body: {
  topic_id: number;
  anchor_date: string;
}): Promise<{ start_date: string; roster_index: number }> {
  const { data } = await apiClient.post<{ start_date: string; roster_index: number }>(
    `${BASE}/cycle/anchor`,
    body,
  );
  return data;
}

export async function setWatchTopicDayOverrideApi(
  date: string,
  topic_id: number | null,
): Promise<PrayerWatchTopicDayAssignment> {
  const { data } = await apiClient.put<PrayerWatchTopicDayAssignment>(`${BASE}/day/${date}`, {
    topic_id,
  });
  return data;
}
