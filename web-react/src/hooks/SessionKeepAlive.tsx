import { useEffect, useRef } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { performAuthRefresh } from '../lib/authRefresh';
import { computeProactiveRefreshIntervalMs, fetchAuthAccessTtlMinutes } from '../lib/authSessionHints';

/** Пока не пришёл `/api/auth/session-hints`, используем тот же расчёт, что для TTL=60 по умолчанию на сервере. */
const FALLBACK_REFRESH_INTERVAL_MS = computeProactiveRefreshIntervalMs(60);
/** Не чаще одного «ручного» продления при возврате в приложение / сеть (нагрузка на API). */
const MIN_GAP_RESUME_REFRESH_MS = 5_000;
/** Debounce для серии offline/online при нестабильной сети. */
const ONLINE_DEBOUNCE_MS = 2_000;
const LAST_REFRESH_KEY = 'auth_last_refresh';

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

function markRefreshNow(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LAST_REFRESH_KEY, String(Date.now()));
}

function readLastRefreshTimestamp(): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = Number(localStorage.getItem(LAST_REFRESH_KEY) ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Долгоживущий refresh cookie + фоновое продление access по TTL с сервера,
 * плюс refresh при возврате во вкладку / PWA / сеть / bfcache / фокусе окна.
 */
export function SessionKeepAlive(): null {
  const token = useAuthStore((s) => s.token);
  const lastExtraRefreshAt = useRef(0);
  const accessTtlMsRef = useRef(60 * 60 * 1000);

  useEffect(() => {
    if (!token) return;

    const runRefresh = (): void => {
      void performAuthRefresh().then((result) => {
        if (result.status === 'refreshed') {
          applyRefreshedAccessToken(result.token);
          markRefreshNow();
        }
      });
    };

    const shouldRefreshByElapsed = (): boolean => {
      const lastRefresh = readLastRefreshTimestamp();
      if (!lastRefresh) return true;
      const elapsed = Date.now() - lastRefresh;
      const halfTtl = accessTtlMsRef.current * 0.5;
      return elapsed > halfTtl;
    };

    const shouldRefreshAfterOnline = (): boolean => {
      const lastRefresh = readLastRefreshTimestamp();
      if (!lastRefresh) return true;
      const elapsed = Date.now() - lastRefresh;
      const threshold = accessTtlMsRef.current * 0.3;
      return elapsed > threshold;
    };

    const maybeRefreshAfterResume = (): void => {
      const now = Date.now();
      if (now - lastExtraRefreshAt.current < MIN_GAP_RESUME_REFRESH_MS) return;
      lastExtraRefreshAt.current = now;
      runRefresh();
    };

    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') return;
      if (shouldRefreshByElapsed()) {
        runRefresh();
        return;
      }
      maybeRefreshAfterResume();
    };

    let onlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const onOnline = (): void => {
      if (onlineDebounceTimer) {
        clearTimeout(onlineDebounceTimer);
      }
      onlineDebounceTimer = setTimeout(() => {
        onlineDebounceTimer = null;
        if (shouldRefreshAfterOnline()) {
          runRefresh();
        }
      }, ONLINE_DEBOUNCE_MS);
    };

    const onPageShow = (_e: PageTransitionEvent): void => {
      maybeRefreshAfterResume();
    };

    const onWindowFocus = (): void => {
      maybeRefreshAfterResume();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onWindowFocus);

    // На старте эффекта не ждём интервала: если прошло >50% TTL, сразу продлеваем.
    if (shouldRefreshByElapsed()) {
      runRefresh();
    }

    let intervalId = window.setInterval(runRefresh, FALLBACK_REFRESH_INTERVAL_MS);
    const hintCtrl = new AbortController();
    let destroyed = false;

    void fetchAuthAccessTtlMinutes(hintCtrl.signal).then((ttlMinutes) => {
      if (destroyed) return;
      accessTtlMsRef.current = ttlMinutes * 60 * 1000;
      if (shouldRefreshByElapsed()) {
        runRefresh();
      }
      const nextMs = computeProactiveRefreshIntervalMs(ttlMinutes);
      window.clearInterval(intervalId);
      intervalId = window.setInterval(runRefresh, nextMs);
    });

    return () => {
      destroyed = true;
      hintCtrl.abort();
      window.clearInterval(intervalId);
      if (onlineDebounceTimer) {
        clearTimeout(onlineDebounceTimer);
      }
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [token]);

  return null;
}
