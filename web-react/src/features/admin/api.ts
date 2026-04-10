import axios from 'axios';

import { apiClient } from '../../lib/apiClient';
import type { Backslider, GlobalTheme, Ministry } from '../../types';

import type { AppUser } from './types';

const USERS = '/api/users';
const CAL = '/api/calendar';

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
  created_at: string;
  updated_at: string;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object') {
      const o = data as {
        error?: unknown;
        db_detail?: unknown;
        db_code?: unknown;
        db_column?: unknown;
        db_constraint?: unknown;
      };
      const base = typeof o.error === 'string' && o.error.trim() ? o.error.trim() : '';
      const detail = typeof o.db_detail === 'string' && o.db_detail.trim() ? o.db_detail.trim() : '';
      const code = typeof o.db_code === 'string' && o.db_code.trim() ? o.db_code.trim() : '';
      const parts: string[] = [];
      if (base) parts.push(base);
      if (detail) parts.push(detail);
      else if (code) parts.push(`код ${code}`);
      if (parts.length) return parts.join(': ');
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
  merge_if_duplicate?: boolean;
}): Promise<AppUser> {
  const { data } = await apiClient.post<AppUser>(USERS, body);
  return data;
}

export async function bulkCreateAdminMembers(body: {
  members: {
    first_name: string;
    last_name: string;
    phone_number: string;
    birth_date: string;
    ministry_role?: string;
    ministry_direction?: string;
  }[];
  merge_if_duplicate?: boolean;
}): Promise<{
  ok: boolean;
  created: number;
  users: AppUser[];
  errors: { index: number; message: string }[];
}> {
  const { data } = await apiClient.post<{
    ok: boolean;
    created: number;
    users: AppUser[];
    errors: { index: number; message: string }[];
  }>(`${USERS}/bulk`, body);
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
    in_prayer_cycle: boolean;
    swap_first_and_last_name: boolean;
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

export async function swapAllMembersFirstLastNames(): Promise<{
  ok: boolean;
  updated: number;
  swapped: number;
  filledFromName: number;
}> {
  const { data } = await apiClient.post<{
    ok: boolean;
    updated: number;
    swapped: number;
    filledFromName: number;
  }>(`${USERS}/swap-all-first-last-names`, {});
  return data;
}

export async function setMemberAppRole(
  id: number,
  app_role: 'member' | 'musician' | 'editor' | 'admin',
): Promise<AppUser> {
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

export async function fetchAdminEvents(): Promise<ChurchEventItem[]> {
  const { data } = await apiClient.get<ChurchEventItem[]>(`${CAL}/events/admin`);
  return data;
}

export async function fetchChurchEventCategoryOptions(): Promise<{ id: string; label: string }[]> {
  const { data } = await apiClient.get<{ options: { id: string; label: string }[] }>(
    `${CAL}/events/category-options`,
  );
  return Array.isArray(data?.options) ? data.options : [];
}

export async function uploadChurchEventPoster(file: File): Promise<{ poster_url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ poster_url: string }>(`${CAL}/events/poster`, form);
  return data;
}

export async function createAdminEvent(body: {
  title: string;
  description?: string;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day?: number | null;
  is_active?: boolean;
  category?: string;
  poster_url?: string | null;
}): Promise<ChurchEventItem> {
  const { data } = await apiClient.post<ChurchEventItem>(`${CAL}/events`, body);
  return data;
}

export async function updateAdminEvent(
  id: number,
  body: Partial<{
    title: string;
    description: string | null;
    event_date: string;
    event_time: string;
    recurrence_type: 'once' | 'weekly';
    weekly_day: number | null;
    is_active: boolean;
    category: string | null;
    poster_url: string | null;
  }>,
): Promise<ChurchEventItem> {
  const { data } = await apiClient.patch<ChurchEventItem>(`${CAL}/events/${id}`, body);
  return data;
}

export async function deleteAdminEvent(id: number): Promise<void> {
  await apiClient.delete(`${CAL}/events/${id}`, {
    validateStatus: (s) => s === 204 || (s != null && s < 500),
  });
}

export async function deleteAllAdminEvents(): Promise<{ ok: boolean; deleted: number }> {
  const { data } = await apiClient.delete<{ ok: boolean; deleted: number }>(`${CAL}/events`);
  return data;
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
