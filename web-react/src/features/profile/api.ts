import { apiClient } from '../../lib/apiClient';

/** Фрагмент ответа `/api/auth/me` — текущий молитвенный цикл (UTC). */
export interface MePrayerCycle {
  index: number;
  number: number;
  member_count: number;
  start_date: string;
  end_date: string;
  day_index: number;
}

/** Ответ GET/PATCH `/api/auth/me`. */
export interface MeResponse {
  id: number;
  /** Слаг публичной страницы (`/profile/:username`); с бэкенда после миграции профиля. */
  username?: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  avatar_url?: string | null;
  phone_number: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  birth_date: string | null;
  email: string | null;
  /** Текст молитвенной нужды для дня, когда вы назначены в календаре */
  prayer_request: string | null;
  /** Текущий цикл: нужда ниже сохраняется на этот цикл. */
  prayer_cycle?: MePrayerCycle | null;
  app_role: string;
  /** Ожидание модерации регистрации или отказ (ограниченный режим приложения). */
  registration_status?: 'active' | 'pending_review' | 'rejected';
  /** Ответственный за сбор — может редактировать назначения на следующую неделю. */
  is_collection_coordinator: boolean;
  /** Участвует в общем молитвенном цикле. */
  in_prayer_cycle?: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatchProfileBody {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  ministry_role?: string;
  ministry_direction?: string;
  birth_date?: string | null;
  email?: string;
  prayer_request?: string;
}

export interface PrayerHistoryItem {
  id: number;
  member_id: number;
  prayer_request: string;
  cycle_index: number | null;
  /** Дата, когда за участника молились в этом цикле (вычисляется бэкендом). */
  prayed_on_date?: string | null;
  created_at: string;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/api/auth/me');
  return data;
}

export async function patchProfile(body: PatchProfileBody): Promise<MeResponse> {
  const { data } = await apiClient.patch<MeResponse>('/api/auth/me', body);
  return data;
}

export async function uploadMyAvatar(file: File): Promise<MeResponse> {
  const form = new FormData();
  form.append('file', file);
  // Не задавать Content-Type вручную: браузер/axios подставит multipart с boundary.
  const { data } = await apiClient.post<MeResponse>('/api/auth/me/avatar', form);
  return data;
}

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  await apiClient.post('/api/auth/change-password', { current_password, new_password });
}

export async function changePhone(current_password: string, new_phone_number: string): Promise<void> {
  await apiClient.post('/api/auth/change-phone', { current_password, new_phone_number });
}

export async function fetchPrayerRequestHistory(
  userId: number,
  limit = 40,
): Promise<PrayerHistoryItem[]> {
  const { data } = await apiClient.get<PrayerHistoryItem[]>(
    `/api/users/${userId}/prayer-requests/history`,
    { params: { limit } },
  );
  return data;
}

export async function fetchVapidPublicKey(): Promise<string> {
  const { data } = await apiClient.get<{ publicKey: string }>('/api/notifications/vapid-public-key');
  return data.publicKey;
}

export async function subscribeToPushApi(subscription: PushSubscription): Promise<void> {
  const body =
    typeof subscription.toJSON === 'function'
      ? (subscription.toJSON() as Record<string, unknown>)
      : (subscription as unknown as Record<string, unknown>);
  await apiClient.post('/api/notifications/subscribe', body);
}

export async function unsubscribeFromPushApi(endpoint: string): Promise<void> {
  await apiClient.post('/api/notifications/unsubscribe', { endpoint });
}
