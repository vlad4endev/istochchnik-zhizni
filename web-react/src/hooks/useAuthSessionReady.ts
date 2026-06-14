import { useEffect, useState } from 'react';

import { useAuthStore } from '../features/auth/authStore';

import { useAuthHydrated } from './useAuthHydrated';

let cookieBootstrapOnce: Promise<void> | null = null;

function isIosPwaStandalone(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      (('standalone' in navigator &&
        (navigator as unknown as { standalone?: boolean }).standalone === true) ||
        window.matchMedia('(display-mode: standalone)').matches)
    );
  } catch {
    return false;
  }
}

function runCookieBootstrapOnce(): Promise<void> {
  if (!cookieBootstrapOnce) {
    cookieBootstrapOnce = useAuthStore.getState().bootstrapSessionFromHttpCookie();
  }
  return cookieBootstrapOnce;
}

/**
 * Persist загружен и выполнена попытка восстановить сессию по HttpOnly cookie
 * (нужно до `RequireAuth`, иначе мигание на /login между поддоменами).
 */
export function useAuthSessionReady(): boolean {
  const hydrated = useAuthHydrated();
  const [cookieAttemptDone, setCookieAttemptDone] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const failsafeMs = isIosPwaStandalone() ? 3_000 : 20_000;
    /** iOS PWA: редкие зависания fetch без ответа — не держать UI на «загрузке» бесконечно. */
    const failsafe = window.setTimeout(() => {
      if (!cancelled) setCookieAttemptDone(true);
    }, failsafeMs);
    void runCookieBootstrapOnce().finally(() => {
      window.clearTimeout(failsafe);
      if (!cancelled) setCookieAttemptDone(true);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
    };
  }, [hydrated]);

  return hydrated && cookieAttemptDone;
}
