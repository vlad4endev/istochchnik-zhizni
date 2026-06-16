import { apiClient } from './client';

export interface ChurchEventItem {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  category?: string | null;
  poster_url?: string | null;
  active_from?: string | null;
  active_to?: string | null;
  skip_summer_break?: boolean;
}

export interface ChurchEventOccurrenceOverride {
  id: number;
  event_id: number;
  occurrence_date: string;
  title: string | null;
  description: string | null;
  event_time: string | null;
  poster_url: string | null;
  is_hidden: boolean;
}

export async function fetchActiveEvents(): Promise<ChurchEventItem[]> {
  const { data } = await apiClient.get<ChurchEventItem[]>('/api/calendar/events');
  return Array.isArray(data) ? data : [];
}

export async function fetchOccurrenceOverrides(): Promise<ChurchEventOccurrenceOverride[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/events/occurrence-overrides');
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is ChurchEventOccurrenceOverride =>
      typeof row === 'object' &&
      row !== null &&
      'event_id' in row &&
      'occurrence_date' in row,
  ) as ChurchEventOccurrenceOverride[];
}
