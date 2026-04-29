/** Формат записи участника из GET `/api/users` (совпадает с `AppUser` на бэкенде). */
export interface AppUser {
  id: number;
  /** Публичный UUID участника (стабильный, не числовой id). */
  user_id: string;
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
  app_role: 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin';
  app_roles?: Array<'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin'>;
  is_collection_coordinator: boolean;
  /** Участвует в общем молитвенном цикле (очередь по дням). */
  in_prayer_cycle: boolean;
  /** Задан пароль для входа (прошёл регистрацию в приложении). */
  has_registered: boolean;
  password_reset_required?: boolean;
  created_at: string;
  updated_at: string;
}
