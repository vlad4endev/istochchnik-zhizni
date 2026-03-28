/** Формат записи участника из GET `/api/users` (совпадает с `AppUser` на бэкенде). */
export interface AppUser {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  phone_number: string | null;
  ministry_role: string | null;
  ministry_direction: string | null;
  prayer_request: string | null;
  birth_date: string | null;
  email: string | null;
  account_provider: string | null;
  account_id: string | null;
  is_active: boolean;
  app_role: 'member' | 'admin';
  is_collection_coordinator: boolean;
  created_at: string;
  updated_at: string;
}
