import { Capacitor } from '@capacitor/core';

/**
 * Режим «сессия только в HttpOnly cookie»: вместо access JWT в localStorage (доступен любому XSS)
 * в сторе и в `auth_access_token` лежит маркер COOKIE_ONLY_SESSION_TOKEN.
 *
 * Включается только в обычной вкладке браузера и только после проверки, что cookie реально
 * доходит до API. Нативные оболочки (Capacitor) и установленные PWA остаются на Bearer:
 * там cookie часто не переживают закрытие приложения, а WebView может жить на другом origin.
 */
const LS_COOKIE_SESSION = 'auth_cookie_session';
const PROBE_TIMEOUT_MS = 8_000;

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    if (typeof window.matchMedia !== 'function') return false;
    return ['standalone', 'fullscreen', 'minimal-ui'].some(
      (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
    );
  } catch {
    return false;
  }
}

/** Можно ли вообще пробовать cookie-режим в этом окружении. */
export function isCookieSessionEligible(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  if (Capacitor.isNativePlatform()) return false;
  return !isStandaloneDisplay();
}

export function isCookieSessionEnabled(): boolean {
  if (!isCookieSessionEligible()) return false;
  try {
    return localStorage.getItem(LS_COOKIE_SESSION) === '1';
  } catch {
    return false;
  }
}

export function setCookieSessionEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(LS_COOKIE_SESSION, '1');
    else localStorage.removeItem(LS_COOKIE_SESSION);
  } catch {
    /* хранилище недоступно */
  }
}

/** GET /api/auth/me без Authorization: 200 — значит cookie-сессия работает. */
export async function probeCookieSession(apiPrefix: string, origin: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${origin}${apiPrefix}/me`, {
      credentials: 'include',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
