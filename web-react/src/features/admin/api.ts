import axios from 'axios';

import { apiClient } from '../../lib/apiClient';
import type { Backslider, GlobalTheme, Ministry } from '../../types';

import type { AppUser } from './types';

const USERS = '/api/users';
const CAL = '/api/calendar';

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const m = (data as { error?: unknown }).error;
      if (typeof m === 'string' && m.trim()) return m.trim();
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export async function fetchAdminMembers(): Promise<AppUser[]> {
  const { data } = await apiClient.get<AppUser[]>(USERS);
  return data;
}

export async function createAdminMember(body: {
  first_name: string;
  last_name: string;
  phone_number: string;
  birth_date: string;
  ministry_role?: string;
  ministry_direction?: string;
}): Promise<AppUser> {
  const { data } = await apiClient.post<AppUser>(USERS, body);
  return data;
}

export async function updateAdminMember(
  id: number,
  body: Partial<{
    first_name: string;
    last_name: string;
    phone_number: string;
    birth_date: string;
    ministry_role: string;
    ministry_direction: string;
    prayer_request: string;
    is_active: boolean;
    is_collection_coordinator: boolean;
  }>,
): Promise<AppUser> {
  const { data } = await apiClient.patch<AppUser>(`${USERS}/${id}`, body);
  return data;
}

export async function deleteAdminMember(id: number): Promise<void> {
  await apiClient.delete(`${USERS}/${id}`);
}

/** Объединяет дубликаты участников (одинаковое ФИО), оставляя карточку с меньшим id. */
export async function mergeDuplicateMembers(): Promise<{ ok: boolean; mergedPairs: number }> {
  const { data } = await apiClient.post<{ ok: boolean; mergedPairs: number }>(
    `${USERS}/merge-duplicates`,
  );
  return data;
}

export async function setMemberAppRole(id: number, app_role: 'member' | 'admin'): Promise<AppUser> {
  const { data } = await apiClient.patch<AppUser>(`${USERS}/${id}/app-role`, { app_role });
  return data;
}

export async function startPrayerCycle(start_date: string): Promise<{ start_date?: string }> {
  const { data } = await apiClient.post<{ start_date?: string }>(`${USERS}/prayer-cycle/start`, {
    start_date,
  });
  return data;
}

export async function setOneTimeMemberDate(memberId: number, target_date: string): Promise<void> {
  await apiClient.post(`${USERS}/${memberId}/prayer-cycle/one-time-date`, { target_date });
}

export interface MinistryTemplate {
  id: number;
  title: string;
  created_at?: string;
}

export interface MinistryDirectionTemplate extends MinistryTemplate {
  roles?: MinistryTemplate[];
}

export async function fetchRoleTemplates(): Promise<MinistryTemplate[]> {
  const { data } = await apiClient.get<MinistryTemplate[]>(`${USERS}/templates/ministry-roles`);
  return data;
}

export async function createRoleTemplate(title: string): Promise<MinistryTemplate> {
  const { data } = await apiClient.post<MinistryTemplate>(`${USERS}/templates/ministry-roles`, {
    title,
  });
  return data;
}

export async function deleteRoleTemplate(id: number): Promise<void> {
  await apiClient.delete(`${USERS}/templates/ministry-roles/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function fetchDirectionTemplates(): Promise<MinistryDirectionTemplate[]> {
  const { data } = await apiClient.get<MinistryDirectionTemplate[]>(`${USERS}/templates/ministry-directions`);
  return data;
}

export async function createDirectionTemplate(title: string): Promise<MinistryTemplate> {
  const { data } = await apiClient.post<MinistryTemplate>(`${USERS}/templates/ministry-directions`, {
    title,
  });
  return data;
}

export async function deleteDirectionTemplate(id: number): Promise<void> {
  await apiClient.delete(`${USERS}/templates/ministry-directions/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function setDirectionTemplateRoles(
  directionTemplateId: number,
  roleIds: number[]
): Promise<MinistryDirectionTemplate> {
  const { data } = await apiClient.put<MinistryDirectionTemplate>(
    `${USERS}/templates/ministry-directions/${directionTemplateId}/roles`,
    { role_ids: roleIds },
  );
  return data;
}

export async function fetchGlobalThemes(): Promise<GlobalTheme[]> {
  const { data } = await apiClient.get<GlobalTheme[]>(`${CAL}/global/themes`);
  return data;
}

export async function createGlobalThemeApi(body: {
  title: string;
  bible_verse?: string;
  prayer_points?: string;
}): Promise<GlobalTheme> {
  const { data } = await apiClient.post<GlobalTheme>(`${CAL}/global/themes`, body);
  return data;
}

export async function updateGlobalThemeApi(
  id: number,
  body: Partial<{ title: string; bible_verse: string | null; prayer_points: string | null }>,
): Promise<GlobalTheme> {
  const { data } = await apiClient.patch<GlobalTheme>(`${CAL}/global/themes/${id}`, body);
  return data;
}

export async function deleteGlobalThemeApi(id: number): Promise<void> {
  await apiClient.delete(`${CAL}/global/themes/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function fetchGlobalMinistries(): Promise<Ministry[]> {
  const { data } = await apiClient.get<Ministry[]>(`${CAL}/global/ministries`);
  return data;
}

export async function createMinistryApi(body: {
  title: string;
  prayer_points?: string;
}): Promise<Ministry> {
  const { data } = await apiClient.post<Ministry>(`${CAL}/global/ministries`, body);
  return data;
}

export async function updateMinistryApi(
  id: number,
  body: Partial<{ title: string; prayer_points: string | null }>,
): Promise<Ministry> {
  const { data } = await apiClient.patch<Ministry>(`${CAL}/global/ministries/${id}`, body);
  return data;
}

export async function deleteMinistryApi(id: number): Promise<void> {
  await apiClient.delete(`${CAL}/global/ministries/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function fetchGlobalBacksliders(): Promise<Backslider[]> {
  const { data } = await apiClient.get<Backslider[]>(`${CAL}/global/backsliders`);
  return data;
}

export async function createBacksliderApi(name: string): Promise<Backslider> {
  const { data } = await apiClient.post<Backslider>(`${CAL}/global/backsliders`, { name });
  return data;
}

export async function updateBacksliderApi(id: number, name: string): Promise<Backslider> {
  const { data } = await apiClient.patch<Backslider>(`${CAL}/global/backsliders/${id}`, { name });
  return data;
}

export async function deleteBacksliderApi(id: number): Promise<void> {
  await apiClient.delete(`${CAL}/global/backsliders/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

/** Заявки на доступ (регистрация без автоматического совпадения с карточкой). */
export interface AccessRequestItem {
  id: number;
  first_name: string;
  last_name: string;
  phone_number: string;
  request_type: 'registration' | 'password_reset';
  status: 'pending' | 'approved' | 'rejected';
  member_id: number | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export async function fetchAccessRequests(
  status?: 'pending' | 'approved' | 'rejected',
): Promise<AccessRequestItem[]> {
  const { data } = await apiClient.get<AccessRequestItem[]>('/api/auth/access-requests', {
    params: status ? { status } : {},
  });
  return data;
}

export async function approveAccessRequest(id: number, review_note?: string): Promise<void> {
  await apiClient.post(`/api/auth/access-requests/${id}/approve`, {
    review_note: review_note?.trim() || undefined,
  });
}

export async function rejectAccessRequest(id: number, review_note?: string): Promise<void> {
  await apiClient.post(`/api/auth/access-requests/${id}/reject`, {
    review_note: review_note?.trim() || undefined,
  });
}

export interface TelegramSettingsResponse {
  enabled: boolean;
  bot_token_masked: string | null;
  prayer_chat_id: string | null;
  coordinator_chat_id: string | null;
  default_chat_id: string | null;
  has_bot_token: boolean;
}

export async function fetchTelegramSettings(): Promise<TelegramSettingsResponse> {
  const { data } = await apiClient.get<TelegramSettingsResponse>('/api/telegram/settings');
  return data;
}

export async function patchTelegramSettings(body: {
  enabled?: boolean;
  bot_token?: string | null;
  prayer_chat_id?: string | null;
  coordinator_chat_id?: string | null;
  default_chat_id?: string | null;
}): Promise<TelegramSettingsResponse> {
  const { data } = await apiClient.patch<TelegramSettingsResponse>('/api/telegram/settings', body);
  return data;
}

export async function sendTelegramMessage(body: {
  kind: 'prayer_today' | 'next_week' | 'custom';
  chat_id?: string;
  text?: string;
}): Promise<{ ok: boolean; kind: string; chat_id: string }> {
  const { data } = await apiClient.post<{ ok: boolean; kind: string; chat_id: string }>(
    '/api/telegram/send',
    body,
  );
  return data;
}
