import axios from 'axios';

import { apiClient } from '../../lib/apiClient';
import type { Backslider, GlobalTheme, Ministry } from '../../types';
import type { PrayerHistoryItem } from '../profile/api';

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
  telegram_chat_id?: string;
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
    telegram_chat_id?: string;
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
    telegram_chat_id: string;
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

export async function resetAdminMemberPassword(id: number): Promise<AppUser> {
  const { data } = await apiClient.post<AppUser>(`${USERS}/${id}/reset-password`);
  return data;
}

/** Ручная запись в историю молитвенных нужд (только админ). */
export async function addAdminPrayerRequestHistory(
  memberId: number,
  body: { prayer_request: string; cycle_number?: number },
): Promise<PrayerHistoryItem> {
  const { data } = await apiClient.post<PrayerHistoryItem>(
    `${USERS}/${memberId}/prayer-requests/history`,
    body,
  );
  return data;
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

export interface SyncTelegramProfilesResult {
  ok: boolean;
  scanned: number;
  processed: number;
  avatars_updated: number;
  phones_updated: number;
  skipped_without_photo: number;
  skipped_without_phone: number;
  storage_enabled: boolean;
  errors: Array<{
    member_id: number;
    telegram_chat_id: string;
    error: string;
  }>;
}

export async function syncMembersFromTelegramProfiles(): Promise<SyncTelegramProfilesResult> {
  const { data } = await apiClient.post<SyncTelegramProfilesResult>(`${USERS}/sync-telegram-profiles`, {});
  return data;
}

export async function setMemberAppRoles(
  id: number,
  app_roles: Array<
    'parishioner' | 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin'
  >,
): Promise<AppUser> {
  const { data } = await apiClient.patch<AppUser>(`${USERS}/${id}/app-role`, { app_roles });
  return data;
}

export async function startPrayerCycle(start_date: string): Promise<{ start_date?: string }> {
  const { data } = await apiClient.post<{ start_date?: string }>(`${USERS}/prayer-cycle/start`, {
    start_date,
  });
  return data;
}

export interface PrayerCycleRosterEntry {
  id: number;
  roster_index: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  is_active: boolean;
}

export interface PrayerCycleRosterSnapshot {
  anchor_date: string;
  start_date: string;
  total: number;
  today_index: number;
  today_member_id: number | null;
  cycle_index: number;
  has_custom_roster_order: boolean;
  roster: PrayerCycleRosterEntry[];
}

export async function fetchPrayerCycleRoster(date: string): Promise<PrayerCycleRosterSnapshot> {
  const { data } = await apiClient.get<PrayerCycleRosterSnapshot>(`${USERS}/prayer-cycle/roster`, {
    params: { date },
  });
  return data;
}

export async function savePrayerCycleRosterOrder(body: {
  anchor_date: string;
  ordered_member_ids: number[];
}): Promise<{ cycle_index: number }> {
  const { data } = await apiClient.put<{ cycle_index: number }>(`${USERS}/prayer-cycle/roster-order`, body);
  return data;
}

export async function anchorPrayerCycleMember(body: {
  member_id: number;
  anchor_date: string;
}): Promise<{ start_date: string; anchor_date: string; roster_index: number; member_id: number }> {
  const { data } = await apiClient.post<{
    start_date: string;
    anchor_date: string;
    roster_index: number;
    member_id: number;
  }>(`${USERS}/prayer-cycle/anchor-member`, body);
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
  active_from?: string | null;
  active_to?: string | null;
  skip_summer_break?: boolean;
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
    active_from: string | null;
    active_to: string | null;
    skip_summer_break: boolean;
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

export async function approveAccessRequest(
  id: number,
  review_note?: string,
  opts?: { app_role?: 'parishioner' },
): Promise<void> {
  await apiClient.post(`/api/auth/access-requests/${id}/approve`, {
    review_note: review_note?.trim() || undefined,
    ...(opts?.app_role === 'parishioner' ? { app_role: 'parishioner' } : {}),
  });
}

export async function rejectAccessRequest(id: number, review_note?: string): Promise<void> {
  await apiClient.post(`/api/auth/access-requests/${id}/reject`, {
    review_note: review_note?.trim() || undefined,
  });
}

export interface TelegramProxyStatus {
  enabled: boolean;
  url_masked: string | null;
  has_url: boolean;
  active_source: 'db' | 'env' | null;
  env_configured: boolean;
}

export interface ServicePlanMailingDestinations {
  telegram_chat_ids: string[];
  messenger_conversation_ids: string[];
}

export interface ServicePlanMailingMessengerChat {
  id: string;
  title: string;
  type: 'channel' | 'group';
  kind: string | null;
  recommended_for: Array<'mailing' | 'published'>;
}

export interface TelegramSettingsResponse {
  enabled: boolean;
  bot_token_masked: string | null;
  prayer_chat_id: string | null;
  coordinator_chat_id: string | null;
  default_chat_id: string | null;
  prayer_template: string | null;
  service_plan_chat_id: string | null;
  service_plan_template: string | null;
  service_plan_published_chat_id: string | null;
  /** Telegram-чат «Медийка» */
  media_chat_id: string | null;
  /** Куда слать плановую рассылку */
  service_plan_mailing_destinations?: ServicePlanMailingDestinations;
  /** Куда слать уведомление при публикации */
  service_plan_published_destinations?: ServicePlanMailingDestinations;
  /** Шаблон текста при публикации финальной программы */
  service_plan_published_template: string | null;
  /** Текст кнопки со ссылкой в уведомлении о публикации */
  service_plan_published_button_text: string | null;
  /** Авторассылка программы: включена ли */
  service_plan_mailing_enabled?: boolean;
  /** День недели 0=вс … 6=сб */
  service_plan_mailing_weekday?: number;
  /** Время HH:MM */
  service_plan_mailing_time?: string;
  /** IANA таймзона, напр. Europe/Moscow */
  service_plan_mailing_timezone?: string;
  has_bot_token: boolean;
  proxy: TelegramProxyStatus;
}

export interface TelegramDispatchSettingsResponse {
  enabled: boolean;
  kind: 'daily' | 'once';
  time_hhmm: string | null;
  once_at_iso: string | null;
  /** ГГГГ-ММ-ДДTчч:мм в часовом поясе сервера */
  once_at_local: string | null;
  target: 'all' | 'selected';
  member_ids: number[];
  last_sent_at_iso: string | null;
  server_timezone: string;
  last_sent_label: string | null;
}

export interface TelegramDispatchRecipient {
  id: number;
  name: string;
  telegram_chat_id: string;
  telegram_delivery_blocked: boolean;
  telegram_delivery_block_reason: string | null;
  telegram_delivery_blocked_at: string | null;
}

export interface SmsSettingsResponse {
  enabled: boolean;
  api_id_masked: string | null;
  sender_name: string | null;
  has_api_id: boolean;
  has_reset_secret: boolean;
}

export interface AppLogItem {
  id: number;
  level: 'info' | 'warn' | 'error';
  scope: string;
  event: string;
  message: string;
  context: Record<string, unknown>;
  request_method: string | null;
  request_path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  user_id: number | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export type TelegramSendLogChannel =
  | 'prayer_dispatch'
  | 'service_plan_mailing'
  | 'service_plan_published'
  | 'coordinator_scenario'
  | 'manual'
  | 'password_reset';

export type TelegramSendLogStatus = 'ok' | 'failed' | 'skipped' | 'blocked';

export interface TelegramSendLogBatchItem {
  batch_id: string;
  channel: TelegramSendLogChannel;
  trigger_source: 'cron' | 'run_now' | 'api' | 'event';
  kind: string | null;
  scenario_id: string | null;
  created_at: string;
  total: number;
  ok_count: number;
  failed_count: number;
  blocked_count: number;
  skipped_count: number;
  preview_text: string;
  recipients: Array<{
    id: number;
    status: TelegramSendLogStatus;
    member_id: number | null;
    member_name: string | null;
    telegram_chat_id: string | null;
    chat_title: string | null;
    error_description: string | null;
    message_text: string;
    created_at: string;
  }>;
}

export async function fetchTelegramSendLogsAdmin(params?: {
  channel?: TelegramSendLogChannel | 'all';
  status?: TelegramSendLogStatus | 'all';
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<TelegramSendLogBatchItem[]> {
  const { data } = await apiClient.get<{ items?: TelegramSendLogBatchItem[] }>(
    '/api/settings/logs/telegram-sends',
    {
      params: {
        channel: params?.channel && params.channel !== 'all' ? params.channel : undefined,
        status: params?.status && params.status !== 'all' ? params.status : undefined,
        search: params?.search?.trim() || undefined,
        limit: params?.limit ?? 40,
        offset: params?.offset ?? 0,
      },
    },
  );
  return Array.isArray(data?.items) ? data.items : [];
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
  prayer_template?: string | null;
  service_plan_chat_id?: string | null;
  service_plan_template?: string | null;
  service_plan_published_chat_id?: string | null;
  media_chat_id?: string | null;
  service_plan_mailing_destinations?: ServicePlanMailingDestinations | null;
  service_plan_published_destinations?: ServicePlanMailingDestinations | null;
  service_plan_published_template?: string | null;
  service_plan_published_button_text?: string | null;
  service_plan_mailing_enabled?: boolean;
  service_plan_mailing_weekday?: number;
  service_plan_mailing_time?: string;
  service_plan_mailing_timezone?: string;
  proxy_enabled?: boolean;
  proxy_url?: string | null;
}): Promise<TelegramSettingsResponse> {
  const { data } = await apiClient.patch<TelegramSettingsResponse>('/api/telegram/settings', body);
  return data;
}

export interface TelegramChatRecord {
  id: number;
  chat_id: string;
  title: string | null;
  type: string | null;
  username: string | null;
  description: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchTelegramMailingMessengerChats(): Promise<
  ServicePlanMailingMessengerChat[]
> {
  const { data } = await apiClient.get<{ chats: ServicePlanMailingMessengerChat[] }>(
    '/api/telegram/mailing-messenger-chats',
  );
  return data.chats ?? [];
}

export async function fetchTelegramChats(): Promise<TelegramChatRecord[]> {
  const { data } = await apiClient.get<TelegramChatRecord[]>('/api/telegram/chats');
  return data;
}

export async function addTelegramChat(chatId: string): Promise<TelegramChatRecord> {
  const { data } = await apiClient.post<TelegramChatRecord>('/api/telegram/chats', {
    chat_id: chatId,
  });
  return data;
}

export async function refreshTelegramChat(id: number): Promise<TelegramChatRecord> {
  const { data } = await apiClient.post<TelegramChatRecord>(`/api/telegram/chats/${id}/refresh`);
  return data;
}

export async function deleteTelegramChat(id: number): Promise<void> {
  await apiClient.delete(`/api/telegram/chats/${id}`);
}

export async function runServicePlanMondayMailing(body?: {
  force?: boolean;
  dry_run?: boolean;
  /** Черновик шаблона для предпросмотра (без сохранения). */
  template?: string | null;
}): Promise<{
  ok: boolean;
  result: {
    ok: boolean;
    skipped?: boolean;
    reason?: string;
    service_date?: string;
    plan_id?: number;
    messenger_ok?: boolean;
    telegram_ok?: boolean;
    text?: string;
    text_messenger?: string;
  };
}> {
  const { data } = await apiClient.post<{
    ok: boolean;
    result: {
      ok: boolean;
      skipped?: boolean;
      reason?: string;
      service_date?: string;
      plan_id?: number;
      messenger_ok?: boolean;
      telegram_ok?: boolean;
      text?: string;
      text_messenger?: string;
    };
  }>('/api/service-plans/monday-mailing/run', body ?? {});
  return data;
}

export async function sendTelegramMessage(body: {
  kind: 'prayer_today' | 'next_week' | 'custom' | 'prayer_today_all_members';
  chat_id?: string;
  text?: string;
}): Promise<{ ok: boolean; kind: string; chat_id: string; sent_count?: number }> {
  const { data } = await apiClient.post<{ ok: boolean; kind: string; chat_id: string; sent_count?: number }>(
    '/api/telegram/send',
    body,
  );
  return data;
}

export async function fetchTelegramDispatchSettings(): Promise<TelegramDispatchSettingsResponse> {
  const { data } = await apiClient.get<TelegramDispatchSettingsResponse>('/api/telegram/dispatch/settings');
  return data;
}

export async function patchTelegramDispatchSettings(body: Partial<TelegramDispatchSettingsResponse>): Promise<TelegramDispatchSettingsResponse> {
  const { data } = await apiClient.patch<TelegramDispatchSettingsResponse>('/api/telegram/dispatch/settings', body);
  return data;
}

export async function fetchTelegramDispatchRecipients(): Promise<TelegramDispatchRecipient[]> {
  const { data } = await apiClient.get<TelegramDispatchRecipient[]>('/api/telegram/dispatch/recipients');
  return data;
}

export async function runTelegramDispatchNow(body?: {
  date?: string;
}): Promise<{ ok: boolean; sent_count: number; mode: 'all' | 'selected' }> {
  const { data } = await apiClient.post<{ ok: boolean; sent_count: number; mode: 'all' | 'selected' }>(
    '/api/telegram/dispatch/run-now',
    body?.date ? { date: body.date } : {},
  );
  return data;
}

export type CoordinatorTelegramScenarioId =
  | 'assignment'
  | 'missing_need_tomorrow'
  | 'missing_need_today'
  | 'missing_cycle_need'
  | 'week_list';

export type CoordinatorTelegramTarget = 'dm' | 'chat' | 'dm_and_chat';

export type CoordinatorTelegramRepeat = 'event' | 'daily' | 'weekly';

export type CoordinatorClaimsWeek = 'current' | 'next';

export type CoordinatorTelegramCondition =
  | 'none'
  | 'missing_on_cycle_day'
  | 'missing_in_cycle';

export interface CoordinatorTelegramScenario {
  id: CoordinatorTelegramScenarioId;
  title: string;
  enabled: boolean;
  target: CoordinatorTelegramTarget;
  repeat: CoordinatorTelegramRepeat;
  condition: CoordinatorTelegramCondition;
  time: string;
  weekDay: number;
  dayOffset: number;
  claimsWeek: CoordinatorClaimsWeek;
  customBody?: string;
}

export interface CoordinatorTelegramScenariosResponse {
  timezone: string;
  scenarios: CoordinatorTelegramScenario[];
}

export async function fetchCoordinatorTelegramScenarios(): Promise<CoordinatorTelegramScenariosResponse> {
  const { data } = await apiClient.get<CoordinatorTelegramScenariosResponse>(
    '/api/telegram/coordinator-scenarios',
  );
  return data;
}

export async function patchCoordinatorTelegramScenarios(body: {
  timezone?: string;
  scenarios?: CoordinatorTelegramScenario[];
}): Promise<CoordinatorTelegramScenariosResponse> {
  const { data } = await apiClient.patch<CoordinatorTelegramScenariosResponse>(
    '/api/telegram/coordinator-scenarios',
    body,
  );
  return data;
}

export async function runCoordinatorTelegramScenarioNow(body: {
  scenario_id: CoordinatorTelegramScenarioId;
}): Promise<{
  ok: boolean;
  scenario_id: CoordinatorTelegramScenarioId;
  sent?: number;
  sent_dm?: number;
  sent_chat?: boolean;
  text?: string;
  reason?: string;
  error?: string;
}> {
  const { data } = await apiClient.post(
    '/api/telegram/coordinator-scenarios/run-now',
    body,
  );
  return data;
}

export async function fetchTelegramDispatchPreviewPrayer(dateYmd?: string): Promise<{ text: string; date: string }> {
  const { data } = await apiClient.get<{ text: string; date: string }>('/api/telegram/dispatch/preview-prayer', {
    params: dateYmd ? { date: dateYmd } : {},
  });
  return data;
}

export interface TelegramTestConnectionResponse {
  ok: true;
  id: number;
  is_bot: boolean;
  username: string | null;
  first_name: string | null;
  latency_ms?: number;
  proxy?: {
    used: boolean;
    source: 'db' | 'env' | null;
    url_masked: string | null;
  };
}

export async function testTelegramConnection(body?: { bot_token?: string }): Promise<TelegramTestConnectionResponse> {
  const { data } = await apiClient.post<TelegramTestConnectionResponse>('/api/telegram/test-connection', body ?? {});
  return data;
}

export interface TelegramTestProxyResponse {
  ok: true;
  latency_ms: number;
  proxy: {
    used: boolean;
    source: 'db' | 'env' | 'override' | null;
    url_masked: string | null;
  };
  bot: {
    id: number;
    is_bot: boolean;
    username: string | null;
    first_name: string | null;
  };
}

export async function testTelegramProxy(body?: {
  proxy_url?: string | null;
  bot_token?: string;
}): Promise<TelegramTestProxyResponse> {
  const { data } = await apiClient.post<TelegramTestProxyResponse>('/api/telegram/test-proxy', body ?? {});
  return data;
}

export function humanizeTelegramError(err: unknown, fallback: string): string {
  const msg = apiErrorMessage(err, fallback);
  if (msg.includes('Telegram модуль выключен')) return 'Telegram модуль выключен. Включите его в настройках.';
  if (msg.includes('Не задан Telegram Bot Token')) return 'Не задан Bot Token. Добавьте токен бота.';
  if (msg.includes('Токен содержит недопустимые символы')) {
    return 'Токен повреждён при вставке (лишние символы). Скопируйте из @BotFather ещё раз.';
  }
  if (msg.includes('Не найдено пользователей с заполненным Telegram ID')) {
    return 'Нет получателей: заполните Telegram ID у пользователей.';
  }
  if (msg.includes('лимита Telegram') || msg.includes('4096 символов')) {
    return msg;
  }
  if (msg.includes('Telegram API вернул ошибку при отправке')) {
    return 'Telegram API отклонил отправку. Проверьте Bot Token и chat_id.';
  }
  if (msg.includes('Запрос к Telegram не выполнен')) {
    return [
      'При отправке сообщения не удалось выполнить HTTPS к api.telegram.org (то же, что и при проверке токена).',
      'Если Telegram недоступен напрямую — включите исходящий HTTP-прокси в настройках Telegram (Админка) и нажмите «Проверить прокси».',
    ].join(' ');
  }
  if (msg.includes('Telegram getMe')) {
    return 'Проверка токена не прошла. Убедитесь, что Bot Token верный и не отозван.';
  }
  if (msg.includes('Таймаут при обращении к Telegram API')) {
    return 'Таймаут при обращении к Telegram. Повторите попытку или проверьте сеть/прокси.';
  }
  if (msg.includes('Нет связи с Telegram API')) {
    const afterColon = msg.includes('Нет связи с Telegram API:')
      ? msg.slice(msg.indexOf('Нет связи с Telegram API:') + 'Нет связи с Telegram API:'.length).trim()
      : '';
    const tech = afterColon.replace(/\s*Исходящий HTTPS.*$/i, '').trim();
    return [
      'Backend не может установить HTTPS-соединение с api.telegram.org (порт 443).',
      'Если curl показывает «Connection reset by peer» — часто режут TLS или IP Telegram.',
      'Укажите исходящий HTTP-прокси прямо в Админке → Telegram (без установки прокси на сервер) и нажмите «Проверить прокси».',
      'Формат: http://user:pass@host:8080 или http://host:3128.',
      tech ? `Ответ Node: ${tech.slice(0, 240)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  if (msg.includes('Некорректный URL прокси') || msg.includes('Поддерживаются только HTTP')) {
    return msg;
  }
  if (msg.includes('Прокси не настроен')) {
    return 'Прокси не настроен. Вставьте URL HTTP-прокси и включите переключатель, либо передайте URL в проверку.';
  }
  if (msg.includes('Не удалось прочитать настройки из базы данных')) {
    return 'Ошибка базы при чтении настроек. Проверьте подключение к БД.';
  }
  if (msg.includes('Укажите в формате ГГГГ-ММ-ДДTчч:мм')) {
    return 'Дата и время для «разово» указаны неверно. Заполните дату и время в часовом поясе сервера.';
  }
  return msg;
}

export async function fetchSmsSettings(): Promise<SmsSettingsResponse> {
  const { data } = await apiClient.get<SmsSettingsResponse>('/api/sms/settings');
  return data;
}

export async function patchSmsSettings(body: {
  enabled?: boolean;
  api_id?: string | null;
  sender_name?: string | null;
  reset_secret?: string | null;
}): Promise<SmsSettingsResponse> {
  const { data } = await apiClient.patch<SmsSettingsResponse>('/api/sms/settings', body);
  return data;
}

export async function fetchAppLogsAdmin(params?: {
  level?: 'info' | 'warn' | 'error';
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AppLogItem[]> {
  const { data } = await apiClient.get<{ items?: AppLogItem[] }>('/api/settings/logs/admin', {
    params: {
      level: params?.level || undefined,
      search: params?.search?.trim() || undefined,
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
    },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

export interface AiPromptScopeOption {
  id: string;
  label: string;
}

export type AiConnectionPresetId = 'openai' | 'deepseek' | 'openrouter' | 'gptunnel' | 'custom';

export interface AiPresetCatalogEntry {
  id: 'openai' | 'deepseek' | 'openrouter' | 'gptunnel';
  label: string;
  description: string;
  base_url: string;
  default_model: string;
  key_hint: string;
  model_options: { id: string; label: string }[];
}

export interface AiSettingsAdminResponse {
  enabled: boolean;
  provider: 'openai_compatible';
  connection_preset: AiConnectionPresetId;
  preset_catalog: AiPresetCatalogEntry[];
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  default_model: string;
  system_prompt: string | null;
  prompt_scopes: AiPromptScopeOption[];
  /** Промпт по разделу; null — использовать общий системный промпт */
  section_prompts: Record<string, string | null>;
  temperature: number;
  max_tokens: number;
  /** Код ассистента GPTunnel для RAG (например ai08158128) */
  gptunnel_assistant_code: string | null;
}

export async function fetchAiSettingsAdmin(): Promise<AiSettingsAdminResponse> {
  const { data } = await apiClient.get<AiSettingsAdminResponse>('/api/settings/ai/admin');
  return data;
}

export async function patchAiSettings(body: {
  enabled?: boolean;
  connection_preset?: AiConnectionPresetId | null;
  base_url?: string | null;
  api_key?: string | null;
  default_model?: string | null;
  system_prompt?: string | null;
  section_prompts?: Partial<Record<string, string | null>>;
  temperature?: number | null;
  max_tokens?: number | null;
  gptunnel_assistant_code?: string | null;
}): Promise<AiSettingsAdminResponse> {
  const { data } = await apiClient.patch<AiSettingsAdminResponse>('/api/settings/ai', body);
  return data;
}

export async function postAiTest(options?: {
  message?: string;
  /** Учесть промпт выбранного раздела (как в chatCompletion) */
  section?: string;
}): Promise<{ ok: boolean; reply: string }> {
  const { data } = await apiClient.post<{ ok: boolean; reply: string }>('/api/settings/ai/test', {
    message: options?.message?.trim() || undefined,
    section: options?.section?.trim() || undefined,
  });
  return data;
}

/** Мониторинг диалогов с ИИ-помощником (админ). */
export type AssistantMonitorActivity = 'all' | 'today' | '7d';
export type AssistantMonitorSort = 'recent' | 'messages' | 'user_messages';

export interface AssistantMonitorStats {
  conversation_count: number;
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  active_today_count: number;
  active_7d_count: number;
}

export interface AssistantMonitorConversation {
  conversation_id: string;
  owner_member_id: number;
  owner_name: string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_avatar_url: string | null;
  owner_phone: string | null;
  owner_app_role: string | null;
  owner_app_roles: string[];
  message_count: number;
  user_message_count: number;
  assistant_message_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from: 'user' | 'assistant' | null;
  created_at: string;
  updated_at: string;
}

export interface AssistantMonitorListResponse {
  items: AssistantMonitorConversation[];
  total: number;
  stats: AssistantMonitorStats;
}

export interface AssistantMonitorMessage {
  id: string;
  conversation_id: string;
  sender_id: number | null;
  content: string;
  payload_type: string;
  payload: Record<string, unknown> | null;
  is_deleted: boolean;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  sender_name: string | null;
  sender_first_name: string | null;
  sender_last_name: string | null;
  from: 'user' | 'assistant';
}

export interface AssistantMonitorMessagesResponse {
  conversation: AssistantMonitorConversation;
  messages: AssistantMonitorMessage[];
  has_more: boolean;
}

export async function fetchAssistantMonitorConversations(params?: {
  search?: string;
  activity?: AssistantMonitorActivity;
  sort?: AssistantMonitorSort;
  limit?: number;
  offset?: number;
}): Promise<AssistantMonitorListResponse> {
  const { data } = await apiClient.get<AssistantMonitorListResponse>('/api/settings/ai/conversations', {
    params: {
      search: params?.search?.trim() || undefined,
      activity: params?.activity && params.activity !== 'all' ? params.activity : undefined,
      sort: params?.sort && params.sort !== 'recent' ? params.sort : undefined,
      limit: params?.limit,
      offset: params?.offset,
    },
  });
  return data;
}

export async function fetchAssistantMonitorMessages(
  conversationId: string,
  params?: { limit?: number; before?: string | null },
): Promise<AssistantMonitorMessagesResponse> {
  const { data } = await apiClient.get<AssistantMonitorMessagesResponse>(
    `/api/settings/ai/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      params: {
        limit: params?.limit,
        before: params?.before || undefined,
      },
    },
  );
  return data;
}

// ─── Backup / резервная копия ───────────────────────────────────────────────

export type BackupTelegramTarget = 'admins' | 'default_chat' | 'both';
export type BackupScheduleKind = 'daily' | 'weekly';

export interface BackupSettings {
  auto_enabled: boolean;
  schedule_time: string;
  schedule_kind: BackupScheduleKind;
  schedule_weekdays: number[];
  timezone: string;
  telegram_send: boolean;
  telegram_target: BackupTelegramTarget;
  retention_days: number;
  last_run_at: string | null;
  last_run_status: 'ok' | 'error' | 'running' | null;
  last_run_message: string | null;
  last_run_backup_id: string | null;
  last_telegram_at: string | null;
  last_telegram_status: 'ok' | 'error' | 'skipped' | null;
  last_telegram_message: string | null;
  backups_dir: string;
  max_retention_days: number;
  telegram_bot_ready: boolean;
}

export interface BackupListItem {
  id: string;
  created_at: string | null;
  dir_path: string;
  archive_path: string | null;
  size_bytes: number;
  has_archive: boolean;
  has_manifest: boolean;
  age_days: number;
}

export async function fetchBackupSettings(): Promise<{
  settings: BackupSettings;
  running: boolean;
  restore_confirm_phrase: string;
}> {
  const { data } = await apiClient.get<{
    settings: BackupSettings;
    running: boolean;
    restore_confirm_phrase: string;
  }>('/api/backup/settings');
  return data;
}

export async function patchBackupSettings(body: {
  auto_enabled?: boolean;
  schedule_time?: string;
  schedule_kind?: BackupScheduleKind;
  schedule_weekdays?: number[];
  timezone?: string;
  telegram_send?: boolean;
  telegram_target?: BackupTelegramTarget;
  retention_days?: number;
}): Promise<{ settings: BackupSettings }> {
  const { data } = await apiClient.patch<{ settings: BackupSettings }>('/api/backup/settings', body);
  return data;
}

export async function fetchBackupList(): Promise<{ items: BackupListItem[]; running: boolean }> {
  const { data } = await apiClient.get<{ items: BackupListItem[]; running: boolean }>('/api/backup/list');
  return data;
}

export async function createBackup(body?: { send_telegram?: boolean }): Promise<{
  ok: boolean;
  backup: {
    id: string;
    archive_path: string | null;
    size_bytes: number;
    telegram?: { ok: boolean; sent: number; message: string };
  };
}> {
  const { data } = await apiClient.post<{
    ok: boolean;
    backup: {
      id: string;
      archive_path: string | null;
      size_bytes: number;
      telegram?: { ok: boolean; sent: number; message: string };
    };
  }>('/api/backup/create', body ?? {}, { timeout: 50 * 60_000 });
  return data;
}

export async function deleteBackup(id: string): Promise<void> {
  await apiClient.delete(`/api/backup/${encodeURIComponent(id)}`);
}

export async function sendBackupTelegram(
  id: string,
  body?: { telegram_target?: BackupTelegramTarget },
): Promise<{ ok: boolean; sent: number; message: string }> {
  const { data } = await apiClient.post<{ ok: boolean; sent: number; message: string }>(
    `/api/backup/${encodeURIComponent(id)}/send-telegram`,
    body ?? {},
    { timeout: 5 * 60_000 },
  );
  return data;
}

export async function downloadBackupArchive(id: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/api/backup/${encodeURIComponent(id)}/download`, {
    responseType: 'blob',
    timeout: 30 * 60_000,
  });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${id}.tar.gz`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface BackupRestoreResult {
  id: string;
  dry_run: boolean;
  ok: boolean;
  message: string;
  log_tail: string;
  restored: { db: boolean; uploads: boolean; secrets: boolean };
}

export async function restoreBackup(
  id: string,
  body: {
    dry_run?: boolean;
    confirm?: string;
    restore_db?: boolean;
    restore_uploads?: boolean;
    restore_secrets?: boolean;
    encrypt_passphrase?: string;
    skip_safety_backup?: boolean;
  },
): Promise<BackupRestoreResult> {
  const { data } = await apiClient.post<BackupRestoreResult>(
    `/api/backup/${encodeURIComponent(id)}/restore`,
    body,
    { timeout: 60 * 60_000 },
  );
  return data;
}
