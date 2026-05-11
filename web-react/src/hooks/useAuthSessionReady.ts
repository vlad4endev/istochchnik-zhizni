import { useEffect, useState } from 'react';

import { useAuthStore } from '../features/auth/authStore';

import { useAuthHydrated } from './useAuthHydrated';

let cookieBootstrapOnce: Promise<void> | null = null;

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
    /** iOS PWA: редкие зависания fetch без ответа — не держать UI на «загрузке» бесконечно. */
    const failsafe = window.setTimeout(() => {
      if (!cancelled) setCookieAttemptDone(true);
    }, 20_000);
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
