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
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  birth_date: string | null;
  email: string | null;
  /** Текст молитвенной нужды для дня, когда вы назначены в календаре */
  prayer_request: string | null;
  /** Текущий цикл: нужда ниже сохраняется на этот цикл. */
  prayer_cycle?: MePrayerCycle | null;
  app_role: string;
  /** Ответственный за сбор — может редактировать назначения на следующую неделю. */
  is_collection_coordinator: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PatchProfileBody {
  first_name?: string;
  last_name?: string;
  phone_number?: string;
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

export async function changePassword(current_password: string, new_password: string): Promise<void> {
  await apiClient.post('/api/auth/change-password', { current_password, new_password });
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
  const { data } = await apiClient.get<{ publicKey: string }>('/api/push/vapid-public-key');
  return data.publicKey;
}

export async function subscribeToPushApi(subscription: PushSubscription): Promise<void> {
  await apiClient.post('/api/push/subscribe', subscription);
}

export async function unsubscribeFromPushApi(endpoint: string): Promise<void> {
  await apiClient.post('/api/push/unsubscribe', { endpoint });
}
