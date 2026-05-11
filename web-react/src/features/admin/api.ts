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

export interface TelegramSettingsResponse {
  enabled: boolean;
  bot_token_masked: string | null;
  prayer_chat_id: string | null;
  coordinator_chat_id: string | null;
  default_chat_id: string | null;
  prayer_template: string | null;
  has_bot_token: boolean;
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
}): Promise<TelegramSettingsResponse> {
  const { data } = await apiClient.patch<TelegramSettingsResponse>('/api/telegram/settings', body);
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
}

export async function testTelegramConnection(body?: { bot_token?: string }): Promise<TelegramTestConnectionResponse> {
  const { data } = await apiClient.post<TelegramTestConnectionResponse>('/api/telegram/test-connection', body ?? {});
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
      'Проверьте исходящий 443, DNS и сеть контейнера; на сервере: curl -I https://api.telegram.org',
    ].join(' ');
  }
  if (msg.includes('Telegram getMe')) {
    return 'Проверка токена не прошла. Убедитесь, что Bot Token верный и не отозван.';
  }
  if (msg.includes('Таймаут при обращении к Telegram API')) {
    return 'Таймаут при обращении к Telegram. Повторите попытку или проверьте сеть.';
  }
  if (msg.includes('Нет связи с Telegram API')) {
    const afterColon = msg.includes('Нет связи с Telegram API:')
      ? msg.slice(msg.indexOf('Нет связи с Telegram API:') + 'Нет связи с Telegram API:'.length).trim()
      : '';
    const tech = afterColon.replace(/\s*Исходящий HTTPS.*$/i, '').trim();
    return [
      'Backend не может установить HTTPS-соединение с api.telegram.org (порт 443).',
      'Если curl показывает «Connection reset by peer» — часто режут TLS или IP Telegram; попробуйте другой хостинг/VPN на уровне сервера или исходящий HTTP-прокси.',
      'Для API за прокси задайте на сервере TELEGRAM_HTTPS_PROXY (или HTTPS_PROXY), например http://user:pass@proxy.example.com:8080, и перезапустите backend.',
      'На сервере: curl -4 -I https://api.telegram.org (ключ -4 — через IPv4, иногда помогает).',
      tech ? `Ответ Node: ${tech.slice(0, 240)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
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

export type AiConnectionPresetId = 'openai' | 'deepseek' | 'openrouter' | 'custom';

export interface AiPresetCatalogEntry {
  id: 'openai' | 'deepseek' | 'openrouter';
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
