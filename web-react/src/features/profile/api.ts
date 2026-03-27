import { apiClient } from '../../lib/apiClient';

/** Ответ GET `/api/auth/me` (см. `AuthUser` в бэкенде). */
export interface MeResponse {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  app_role: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiClient.get<MeResponse>('/api/auth/me');
  return data;
}
