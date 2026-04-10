/**
 * Маркер: сессия подтверждается HttpOnly cookie (кросс-поддоменно), без Bearer в localStorage.
 * Запросы идут с `credentials: 'include'`; API читает токен из cookie.
 */
export const COOKIE_ONLY_SESSION_TOKEN = '__cookie_session__';

export function isCookieOnlySessionToken(token: string | null | undefined): boolean {
  return token === COOKIE_ONLY_SESSION_TOKEN;
}
