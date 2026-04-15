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
  const clearSession = useAuthStore((s) => s.clearSession);
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
          registrationStatus: normalizeRegistrationStatus(me.registration_status),
          username: (me.username ?? '').trim(),
          memberId: typeof me.id === 'number' ? me.id : null,
        });
        doneForToken.current = token;
      } catch (e: unknown) {
        if (cancelled) return;
        const status =
          typeof e === 'object' && e !== null && 'response' in e
            ? (e as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
          clearSession();
          doneForToken.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, token, applyServerProfile, clearSession]);
}
