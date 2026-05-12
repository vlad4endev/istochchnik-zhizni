import { useEffect, useRef } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { performAuthRefresh } from '../lib/authRefresh';
import { COOKIE_ONLY_SESSION_TOKEN } from '../lib/authSessionConstants';
import { computeProactiveRefreshIntervalMs, fetchAuthAccessTtlMinutes } from '../lib/authSessionHints';

/** Пока не пришёл `/api/auth/session-hints`, используем тот же расчёт, что для TTL=60 по умолчанию на сервере. */
const FALLBACK_REFRESH_INTERVAL_MS = computeProactiveRefreshIntervalMs(60);
/** Не чаще одного «ручного» продления при возврате в приложение / сеть (нагрузка на API). */
const MIN_GAP_RESUME_REFRESH_MS = 12_000;

function applyRefreshedAccessToken(): void {
  const auth = useAuthStore.getState();
  auth.setSession({
    token: COOKIE_ONLY_SESSION_TOKEN,
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
 * Долгоживущий refresh cookie + фоновое продление access по TTL с сервера,
 * плюс refresh при возврате во вкладку / PWA / сеть / bfcache / фокусе окна.
 */
export function SessionKeepAlive(): null {
  const token = useAuthStore((s) => s.token);
  const lastExtraRefreshAt = useRef(0);
  const wasHidden = useRef(false);

  useEffect(() => {
    if (!token) return;

    const runRefresh = (): void => {
      void performAuthRefresh().then((result) => {
        if (result.status === 'refreshed') applyRefreshedAccessToken();
      });
    };

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

    const onPageShow = (e: PageTransitionEvent): void => {
      if (e.persisted) {
        maybeRefreshAfterResume();
      }
    };

    const onWindowFocus = (): void => {
      maybeRefreshAfterResume();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onWindowFocus);

    let intervalId = window.setInterval(runRefresh, FALLBACK_REFRESH_INTERVAL_MS);
    const hintCtrl = new AbortController();
    let destroyed = false;

    void fetchAuthAccessTtlMinutes(hintCtrl.signal).then((ttlMinutes) => {
      if (destroyed) return;
      const nextMs = computeProactiveRefreshIntervalMs(ttlMinutes);
      window.clearInterval(intervalId);
      intervalId = window.setInterval(runRefresh, nextMs);
    });

    /** После bootstrap уже есть refresh; короткая задержка снижает конкуренцию с чанками/SW на iOS PWA. */
    const bootRefreshTimer = window.setTimeout(runRefresh, 1_200);

    return () => {
      destroyed = true;
      hintCtrl.abort();
      window.clearTimeout(bootRefreshTimer);
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [token]);

  return null;
}
