import { apiClient } from './client';

export interface MusicRole {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface MusicAssignment {
  id: number;
  event_ref_id: number;
  member_id: number;
  role_id: number;
  status: 'assigned' | 'confirmed' | 'declined' | 'pending';
  notes?: string | null;
  member: { id: number; name: string; avatar_url?: string | null };
  role: MusicRole;
}

export interface MusicEvent {
  id: number;
  event_ref_id: number;
  title: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  event_type: string;
  template_name?: string | null;
  assignments: MusicAssignment[];
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEvent(raw: MusicEvent): MusicEvent {
  const refId = raw.event_ref_id ?? raw.id;
  return {
    ...raw,
    id: refId,
    event_ref_id: refId,
    assignments: (raw.assignments ?? []).map((a) => ({
      ...a,
      event_ref_id: a.event_ref_id ?? refId,
    })),
  };
}

export async function fetchMyMusicSchedule(from: Date, to: Date): Promise<MusicEvent[]> {
  const { data } = await apiClient.get<{ events: MusicEvent[] }>('/api/music-schedule/my-schedule', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function fetchMusicEvents(from: Date, to: Date): Promise<MusicEvent[]> {
  const { data } = await apiClient.get<{ events: MusicEvent[] }>('/api/music-schedule/events', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function updateMusicAssignmentStatus(
  assignmentId: number,
  status: 'confirmed' | 'declined',
): Promise<void> {
  await apiClient.patch(`/api/music-schedule/assignments/${assignmentId}/status`, { status });
}
