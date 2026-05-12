import { useEffect, useRef } from 'react';

import { normalizeRegistrationStatus, useAuthStore } from '../features/auth/authStore';
import { fetchMe } from '../features/profile/api';

import { useAuthHydrated } from './useAuthHydrated';

/**
 * После входа роль хранится в localStorage. Если в БД позже выдали admin,
 * без запроса к серверу пункт «Админ» не появится. Подтягиваем GET /api/auth/me
 * один раз при гидрации и при появлении токена.
 */
export function useSyncServerRole(): void {
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);
  const doneForToken = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !token) {
      doneForToken.current = null;
      return;
    }
    if (doneForToken.current === token) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        applyServerProfile({
          firstName: me.first_name ?? '',
          lastName: me.last_name ?? '',
          role: me.app_role ?? 'member',
          roles: Array.isArray(me.app_roles) ? me.app_roles : undefined,
          registrationStatus: normalizeRegistrationStatus(me.registration_status),
          username: (me.username ?? '').trim(),
          memberId: typeof me.id === 'number' ? me.id : null,
        });
        doneForToken.current = token;
      } catch {
        /* 401 и прочие ошибки обрабатывает apiClient (refresh / сброс сессии); здесь не чистим — избегаем ложного выхода при сети. */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, token, applyServerProfile]);
}
