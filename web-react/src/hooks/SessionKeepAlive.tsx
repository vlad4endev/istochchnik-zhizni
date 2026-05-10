import { useEffect, useRef } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { performAuthRefresh } from '../lib/authRefresh';

/** Чаще access TTL на сервере (AUTH_ACCESS_TOKEN_TTL_MINUTES), чтобы не ждать 401. */
const REFRESH_INTERVAL_MS = 4 * 60 * 1000;
/** Не чаще одного «ручного» продления при возврате в приложение / сеть (нагрузка на API). */
const MIN_GAP_RESUME_REFRESH_MS = 12_000;

function applyRefreshedAccessToken(nextToken: string): void {
  const auth = useAuthStore.getState();
  auth.setSession({
    token: nextToken,
    firstName: auth.firstName,
    lastName: auth.lastName,
    role: auth.role,
    roles: auth.roles,
    registrationStatus: auth.registrationStatus,
    username: auth.username,
    memberId: auth.memberId,
  });
}

/**
 * Поведение ближе к нативному приложению: долгоживущий refresh cookie на сервере + фоновое
 * продление access без выхода из аккаунта (таймер, возврат во вкладку / PWA, восстановление сети).
 */
export function SessionKeepAlive(): null {
  const token = useAuthStore((s) => s.token);
  const lastExtraRefreshAt = useRef(0);
  const wasHidden = useRef(false);

  useEffect(() => {
    if (!token) return;

    const runRefresh = (): void => {
      void performAuthRefresh().then((next) => {
        if (next) applyRefreshedAccessToken(next);
      });
    };

    /** Регулярное продление — без throttle (интервал уже редкий). */
    const intervalId = window.setInterval(runRefresh, REFRESH_INTERVAL_MS);

    /** Возврат в приложение / вкладку или после офлайна — с анти-дребезгом. */
    const maybeRefreshAfterResume = (): void => {
      const now = Date.now();
      if (now - lastExtraRefreshAt.current < MIN_GAP_RESUME_REFRESH_MS) return;
      lastExtraRefreshAt.current = now;
      runRefresh();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true;
        return;
      }
      if (wasHidden.current) {
        wasHidden.current = false;
        maybeRefreshAfterResume();
      }
    };

    const onOnline = (): void => {
      maybeRefreshAfterResume();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    /** Сразу после входа / восстановления стора — один тихий refresh (как при открытии нативного клиента). */
    runRefresh();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [token]);

  return null;
}
