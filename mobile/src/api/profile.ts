import { apiClient } from './client';

export type MeProfile = {
  id?: number;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  username?: string;
  app_role?: string;
  app_roles?: string[];
  registration_status?: string;
  prayer_request?: string | null;
  ministry_role?: string | null;
  ministry_direction?: string | null;
  is_collection_coordinator?: boolean;
};

export async function fetchMe(): Promise<MeProfile> {
  const { data } = await apiClient.get<MeProfile>('/api/auth/me');
  return data;
}

export async function patchProfilePrayerRequest(prayer_request: string): Promise<void> {
  await apiClient.patch('/api/auth/me', { prayer_request });
}
