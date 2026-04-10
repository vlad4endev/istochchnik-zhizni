/**
 * Базовый URL API (аналог lib/core/config/app_config.dart).
 *
 * **Локально (vite dev):** в `.env` не задавайте `VITE_API_BASE_URL` (или оставьте пустым).
 * Запросы идут на `window.location.origin` (например `http://localhost:5173`), пути `/api/...`
 * проксируются в `vite.config.ts` на бэкенд (`VITE_DEV_API_PROXY`).
 *
 * **Production (собранный `npm run build`):** задайте на этапе сборки или в CI:
 *   `VITE_API_BASE_URL=https://api.yourdomain.com` (без завершающего `/`).
 * Тогда axios ходит напрямую на этот хост. Если фронт и API на одном домене и nginx
 * проксирует `/api` на Node — снова оставьте пустым: будет относительный путь к тому же origin.
 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiBaseUrlFromEnv(): string {
  const raw = import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL;
  if (raw === undefined || raw === null) {
    return '';
  }
  return trimTrailingSlash(String(raw).trim());
}

/**
 * Base URL для axios: явный VITE_API_BASE_URL или window.location.origin в браузере.
 * Совпадает с логикой AppConfig.dioBaseUrl при пустом apiBaseUrl на web.
 */
export function resolveAxiosBaseURL(): string {
  const fromEnv = getApiBaseUrlFromEnv();
  if (fromEnv.length > 0) {
    return fromEnv;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

/** GET {origin}/api/auth/me — путь относительно base URL axios. */
export const AUTH_API_PREFIX = '/api/auth';

/** Для прямых URL без общего base (например fetch). */
export function getAuthApiBaseUrl(): string {
  const base = resolveAxiosBaseURL();
  return `${base}${AUTH_API_PREFIX}`;
}

export function getUsersApiBaseUrl(): string {
  return `${resolveAxiosBaseURL()}/api/users`;
}

export function getCalendarApiBaseUrl(): string {
  return `${resolveAxiosBaseURL()}/api/calendar`;
}

/**
 * WebSocket для realtime (`/api/realtime`): тот же хост, что и REST (Vite proxy или nginx /api).
 */
/**
 * Origin веб-приложения чатов (отдельный поддомен). Пусто — чаты встроены в основной SPA (legacy).
 * Пример: https://chat.church-tambov.ru
 */
export function resolveMessengerWebOrigin(): string {
  const raw = import.meta.env.VITE_MESSENGER_ORIGIN ?? '';
  return trimTrailingSlash(String(raw).trim());
}

export function resolveRealtimeWebSocketUrl(): string {
  const httpBase = resolveAxiosBaseURL().trim();
  if (!httpBase) {
    if (typeof window !== 'undefined' && window.location?.host) {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/api/realtime`;
    }
    return '';
  }
  try {
    const u = new URL(httpBase.includes('://') ? httpBase : `https://${httpBase}`);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/api/realtime';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}

/**
 * Аналог AppConfig.isApiUrlProbablyWrongForWeb: прод-сайт на HTTPS, а в билде остался localhost.
 */
export function isApiUrlProbablyWrongForWeb(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const host = window.location.hostname;
  if (!host || host === 'localhost' || host.startsWith('127.')) {
    return false;
  }
  const u = getApiBaseUrlFromEnv();
  if (!u) {
    return false;
  }
  return u.includes('localhost') || u.includes('127.0.0.1');
}
