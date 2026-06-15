import { apiClient } from '../../lib/apiClient';

import type { MediaAssignment, MediaEvent, MediaRole, MediaScheduleMember } from './types';

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEvent(raw: MediaEvent): MediaEvent {
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

export async function fetchMediaEvents(from: Date, to: Date): Promise<MediaEvent[]> {
  const { data } = await apiClient.get<{ events: MediaEvent[] }>('/api/media-schedule/events', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function fetchMediaEventByPlanId(planId: number): Promise<MediaEvent> {
  const { data } = await apiClient.get<{ event: MediaEvent }>(`/api/media-schedule/events/${planId}`);
  return normalizeEvent({ ...data.event, assignments: data.event.assignments ?? [] });
}

export async function fetchMediaAssignmentsForPlan(planId: number): Promise<MediaAssignment[]> {
  const { data } = await apiClient.get<{ assignments: MediaAssignment[] }>(
    `/api/media-schedule/plans/${planId}/assignments`,
  );
  return data.assignments ?? [];
}

export async function resolveMediaPlanForChurchEvent(
  churchEventId: number,
  date: string,
): Promise<number | null> {
  const { data } = await apiClient.get<{ plan_id: number | null }>('/api/media-schedule/resolve-plan', {
    params: { church_event_id: churchEventId, date },
  });
  return data.plan_id ?? null;
}

export async function assignMediaMember(
  planId: number,
  memberId: number,
  roleId: number,
): Promise<void> {
  await apiClient.post(`/api/media-schedule/events/${planId}/assign`, {
    member_id: memberId,
    role_id: roleId,
  });
}

export async function removeMediaAssignment(assignmentId: number): Promise<void> {
  await apiClient.delete(`/api/media-schedule/assignments/${assignmentId}`);
}

export async function updateMediaAssignmentStatus(
  assignmentId: number,
  status: 'confirmed' | 'declined',
): Promise<void> {
  await apiClient.patch(`/api/media-schedule/assignments/${assignmentId}/status`, { status });
}

export async function fetchMyMediaSchedule(from: Date, to: Date): Promise<MediaEvent[]> {
  const { data } = await apiClient.get<{ events: MediaEvent[] }>('/api/media-schedule/my-schedule', {
    params: { from: formatYmd(from), to: formatYmd(to) },
  });
  return (data.events ?? []).map(normalizeEvent);
}

export async function fetchMediaMembers(): Promise<MediaScheduleMember[]> {
  const { data } = await apiClient.get<{ members: MediaScheduleMember[] }>('/api/media-schedule/members');
  return data.members ?? [];
}

export async function fetchMediaRoles(): Promise<MediaRole[]> {
  const { data } = await apiClient.get<{ roles: MediaRole[] }>('/api/media-schedule/roles');
  return data.roles ?? [];
}

export async function createMediaRole(body: {
  name: string;
  color?: string;
  icon?: string | null;
  ministry_direction_filter?: string | null;
}): Promise<MediaRole> {
  const { data } = await apiClient.post<{ role: MediaRole }>('/api/media-schedule/roles', body);
  return data.role;
}

export async function updateMediaRole(
  id: number,
  body: Partial<{
    name: string;
    color: string;
    icon: string | null;
    is_active: boolean;
    ministry_direction_filter: string | null;
  }>,
): Promise<MediaRole> {
  const { data } = await apiClient.put<{ role: MediaRole }>(`/api/media-schedule/roles/${id}`, body);
  return data.role;
}

export async function deleteMediaRole(id: number): Promise<void> {
  await apiClient.delete(`/api/media-schedule/roles/${id}`);
}

export async function reorderMediaRoles(ids: number[]): Promise<MediaRole[]> {
  const { data } = await apiClient.post<{ roles: MediaRole[] }>('/api/media-schedule/roles/reorder', {
    ids,
  });
  return data.roles ?? [];
}

export function apiErrorMessage(err: unknown, fallback = 'Не удалось выполнить запрос'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { error?: string } } }).response;
    const msg = resp?.data?.error;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return fallback;
}
