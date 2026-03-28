import { apiClient } from '../../lib/apiClient';

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
  app_role: string;
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
