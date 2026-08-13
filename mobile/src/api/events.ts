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

export type CalendarSundayService = {
  id: number;
  service_date: string;
  start_time: string;
  title: string;
  leader: { id: number; name: string; avatar_url: string | null } | null;
  preacher: { id: number; name: string; avatar_url: string | null } | null;
  sermon_topic: string | null;
  sermon_scripture: string | null;
  songs: Array<{ title: string; key: string | null }>;
};

export async function fetchCalendarSundayServices(params?: {
  from?: string;
  to?: string;
}): Promise<CalendarSundayService[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/sunday-services', { params });
  if (!Array.isArray(data)) return [];
  const out: CalendarSundayService[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const serviceDate = typeof row.service_date === 'string' ? row.service_date.slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) continue;
    const leader = row.leader && typeof row.leader === 'object' ? (row.leader as { name?: string; id?: number; avatar_url?: string | null }) : null;
    const preacher = row.preacher && typeof row.preacher === 'object' ? (row.preacher as { name?: string; id?: number; avatar_url?: string | null }) : null;
    const songsRaw = Array.isArray(row.songs) ? row.songs : [];
    out.push({
      id: Number(row.id) || 0,
      service_date: serviceDate,
      start_time: typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : '10:00',
      title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : 'Воскресное служение',
      leader: leader?.name
        ? { id: Number(leader.id) || 0, name: String(leader.name), avatar_url: leader.avatar_url ?? null }
        : null,
      preacher: preacher?.name
        ? { id: Number(preacher.id) || 0, name: String(preacher.name), avatar_url: preacher.avatar_url ?? null }
        : null,
      sermon_topic: typeof row.sermon_topic === 'string' && row.sermon_topic.trim() ? row.sermon_topic.trim() : null,
      sermon_scripture:
        typeof row.sermon_scripture === 'string' && row.sermon_scripture.trim()
          ? row.sermon_scripture.trim()
          : null,
      songs: songsRaw
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const title = typeof (s as { title?: unknown }).title === 'string' ? (s as { title: string }).title.trim() : '';
          if (!title) return null;
          const keyRaw = (s as { key?: unknown }).key;
          return { title, key: typeof keyRaw === 'string' && keyRaw.trim() ? keyRaw.trim() : null };
        })
        .filter((s): s is { title: string; key: string | null } => s != null),
    });
  }
  return out;
}

export function sundayServiceToEventItem(service: CalendarSundayService): ChurchEventItem {
  const lines: string[] = [];
  if (service.leader?.name) lines.push(`Ведущий: ${service.leader.name}`);
  if (service.preacher?.name) lines.push(`Проповедник: ${service.preacher.name}`);
  if (service.sermon_topic) {
    lines.push(
      service.sermon_scripture
        ? `Проповедь: ${service.sermon_topic} (${service.sermon_scripture})`
        : `Проповедь: ${service.sermon_topic}`,
    );
  }
  if (service.songs.length > 0) {
    lines.push(`Песни: ${service.songs.map((s) => (s.key ? `${s.title} [${s.key}]` : s.title)).join(', ')}`);
  }
  return {
    id: service.id > 0 ? 900_000_000 + service.id : 800_000_000 + Number(service.service_date.replace(/-/g, '')),
    title: service.title,
    description: lines.join('\n') || null,
    event_date: service.service_date,
    event_time: service.start_time || '10:00',
    recurrence_type: 'once',
    weekly_day: null,
    is_active: true,
    category: 'Служение',
  };
}
