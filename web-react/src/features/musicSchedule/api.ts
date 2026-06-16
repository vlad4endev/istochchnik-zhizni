import { apiClient } from '../../lib/apiClient';

import type { MusicAssignment, MusicEvent, MusicRole, MusicScheduleMember } from './types';

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
      event_id: a.event_ref_id ?? refId,
    })),
  };
}

export async function fetchMusicEvents(from: Date, to: Date): Promise<MusicEvent[]> {
  const { data } = await apiClient.get<{ events: MusicEvent[] }>('/api/music-schedule/events', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function fetchMusicEventByPlanId(planId: number): Promise<MusicEvent> {
  const { data } = await apiClient.get<{ event: MusicEvent }>(`/api/music-schedule/events/${planId}`);
  return normalizeEvent({ ...data.event, assignments: data.event.assignments ?? [] });
}

export async function fetchMusicAssignmentsForPlan(planId: number): Promise<MusicAssignment[]> {
  const { data } = await apiClient.get<{ assignments: MusicAssignment[] }>(
    `/api/music-schedule/plans/${planId}/assignments`,
  );
  return data.assignments ?? [];
}

export async function resolveMusicPlanForChurchEvent(
  churchEventId: number,
  date: string,
): Promise<number | null> {
  const { data } = await apiClient.get<{ plan_id: number | null }>('/api/music-schedule/resolve-plan', {
    params: { church_event_id: churchEventId, date },
  });
  return data.plan_id ?? null;
}

export async function assignMusicMember(
  planId: number,
  memberId: number,
  roleId: number,
): Promise<void> {
  await apiClient.post(`/api/music-schedule/events/${planId}/assign`, {
    member_id: memberId,
    role_id: roleId,
  });
}

export async function removeMusicAssignment(assignmentId: number): Promise<void> {
  await apiClient.delete(`/api/music-schedule/assignments/${assignmentId}`);
}

export async function updateMusicAssignmentStatus(
  assignmentId: number,
  status: 'confirmed' | 'declined',
): Promise<void> {
  await apiClient.patch(`/api/music-schedule/assignments/${assignmentId}/status`, { status });
}

export async function fetchMyMusicSchedule(from: Date, to: Date): Promise<MusicEvent[]> {
  const { data } = await apiClient.get<{ events: MusicEvent[] }>('/api/music-schedule/my-schedule', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function fetchMusicMembers(roleId?: number): Promise<MusicScheduleMember[]> {
  const { data } = await apiClient.get<{ members: MusicScheduleMember[] }>('/api/music-schedule/members', {
    params: roleId != null && roleId > 0 ? { role_id: roleId } : undefined,
  });
  return data.members ?? [];
}

export async function fetchMusicRoles(): Promise<MusicRole[]> {
  const { data } = await apiClient.get<{ roles: MusicRole[] }>('/api/music-schedule/roles');
  return data.roles ?? [];
}

export async function createMusicRole(body: {
  name: string;
  color?: string;
  icon?: string | null;
  ministry_direction_filter?: string | null;
  ministry_role_filter?: string | null;
}): Promise<MusicRole> {
  const { data } = await apiClient.post<{ role: MusicRole }>('/api/music-schedule/roles', body);
  return data.role;
}

export async function updateMusicRole(
  id: number,
  body: Partial<{
    name: string;
    color: string;
    icon: string | null;
    is_active: boolean;
    ministry_direction_filter: string | null;
    ministry_role_filter: string | null;
  }>,
): Promise<MusicRole> {
  const { data } = await apiClient.put<{ role: MusicRole }>(`/api/music-schedule/roles/${id}`, body);
  return data.role;
}

export async function deleteMusicRole(id: number): Promise<void> {
  await apiClient.delete(`/api/music-schedule/roles/${id}`);
}

export async function reorderMusicRoles(ids: number[]): Promise<MusicRole[]> {
  const { data } = await apiClient.post<{ roles: MusicRole[] }>('/api/music-schedule/roles/reorder', {
    ids,
  });
  return data.roles ?? [];
}

export function apiErrorMessage(err: unknown, fallback = 'Не удалось выполнить запрос'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { error?: string } } }).response;
    const msg = resp?.data?.error;
    if (typeof msg === 'string' && msg.trim()) {
      const trimmed = msg.trim();
      if (trimmed.includes('может только просматривать данные')) {
        return 'Недостаточно прав для этого действия. Обновите приложение или обратитесь к координатору.';
      }
      return trimmed;
    }
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}
