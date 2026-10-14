import axios, { type AxiosError, type AxiosHeaders, type InternalAxiosRequestConfig, isCancel } from 'axios';

import { useAuthStore } from '../features/auth/authStore';

import { performAuthRefresh } from './authRefresh';
import { COOKIE_ONLY_SESSION_TOKEN, isCookieOnlySessionToken } from './authSessionConstants';
import { resolveAxiosBaseURL } from './config';
import { isLocalDbAvailable, isQueueableWrite, localDbGet, localDbPut, outboxAdd } from './localDb';
import { isSessionTeardownActive } from './sessionTeardown';
import { emitAppToast } from './uiFeedback';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Не показывать глобальный toast при ошибке ответа. */
    silentErrorToast?: boolean;
    /**
     * Фоновые запросы (например sync Web Push): при 401 не вызывать clearSession.
     * Refresh/cookie-retry всё равно пробуются; при неуспехе ошибка уходит вызывающему коду.
     */
    skipAuthClearOn401?: boolean;
    /** Повтор из очереди SQLite: при обрыве не ставить в очередь второй раз. */
    skipLocalOutbox?: boolean;
  }
}

const AUTH_PATHS_SKIP_401_HANDLING = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

function shouldSkip401Handling(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_PATHS_SKIP_401_HANDLING.some((p) => url.includes(p));
}

function readResponseErrorMessage(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error: unknown }).error;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  }
  return null;
}

function formatApiFailureHint(status: number | undefined, url: string, fallback: string): string {
  const cleanUrl = (url || '').trim();
  const code = typeof status === 'number' ? String(status) : '';
  if (!code && !cleanUrl) return fallback;
  const prefix = code ? `Ошибка ${code}` : 'Ошибка';
  return cleanUrl ? `${prefix}: ${cleanUrl}` : `${prefix}. ${fallback}`;
}

function getTokenForRequest(): string | null {
  try {
    return useAuthStore.getState().token;
  } catch {
    return null;
  }
}

type RetryableAxiosConfig = InternalAxiosRequestConfig & {
  _retryAfterRefresh?: boolean;
  _retryCookieOnly?: boolean;
  /** Один повтор при кратков сетевом сбое (рестарт API / nginx upstream). */
  _retryNetworkOnce?: boolean;
  /** Зонд cookie-only: не чистить сессию в этом проходе — решает внешний 401-handler. */
  _suppressAuthClear?: boolean;
  /** Не показывать глобальный toast при 4xx/5xx (ошибку обрабатывает экран). */
  silentErrorToast?: boolean;
  /** Фоновый запрос: не сбрасывать сессию при окончательном 401. */
  skipAuthClearOn401?: boolean;
};

function readAuthorizationHeader(config: InternalAxiosRequestConfig): string | undefined {
  const h = config.headers;
  if (!h) return undefined;
  const raw =
    typeof (h as AxiosHeaders).get === 'function'
      ? (h as AxiosHeaders).get('Authorization') ?? (h as AxiosHeaders).get('authorization')
      : (h as Record<string, unknown>).Authorization ?? (h as Record<string, unknown>).authorization;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
}

/** После refresh Access из стора новый; убираем старый Bearer из повторяемого config. */
function stripStaleAuthorization(config: InternalAxiosRequestConfig): void {
  const h = config.headers;
  if (!h) return;
  if (typeof (h as AxiosHeaders).delete === 'function') {
    (h as AxiosHeaders).delete('Authorization');
    (h as AxiosHeaders).delete('authorization');
  } else {
    delete (h as Record<string, unknown>).Authorization;
    delete (h as Record<string, unknown>).authorization;
  }
  const common = (config.headers as { common?: Record<string, unknown> }).common;
  if (common) {
    delete common.Authorization;
    delete common.authorization;
  }
}

/** Устаревший Bearer в LS при живой HttpOnly cookie — повторяем запрос только с credentials. */
function switchSessionToCookieOnly(): void {
  try {
    const auth = useAuthStore.getState();
    if (!auth.token || isCookieOnlySessionToken(auth.token)) return;
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
  } catch {
    /* store недоступен */
  }
}

export const apiClient = axios.create({
  timeout: 25_000,
  headers: { Accept: 'application/json' },
  withCredentials: true,
});

/** Не спамить admin-toast при серии фоновых poll'ов во время краткого рестарта API. */
const NETWORK_TOAST_COOLDOWN_MS = 60_000;
const SERVER_ERROR_TOAST_COOLDOWN_MS = 60_000;
const TRANSIENT_NETWORK_RETRY_DELAY_MS = 700;
let lastNetworkToastAt = 0;
let lastServerErrorToastAt = 0;

function shouldEmitCooldownToast(lastAt: number, cooldownMs: number): boolean {
  const now = Date.now();
  if (now - lastAt < cooldownMs) return false;
  return true;
}

function markCooldownToast(kind: 'network' | 'server'): void {
  const now = Date.now();
  if (kind === 'network') lastNetworkToastAt = now;
  else lastServerErrorToastAt = now;
}

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function isTransientNetworkError(error: AxiosError): boolean {
  if (error.response) return false;
  const code = String(error.code ?? '');
  // Не ретраим таймауты (ECONNABORTED) — это долгие запросы, не краткий обрыв.
  return (
    code === 'ERR_NETWORK' ||
    /network error|failed to fetch/i.test(String(error.message ?? ''))
  );
}

/** Реальный обрыв связи (не таймаут, не отмена, не offline-бар Layout). */
function isConnectivityFailure(error: AxiosError): boolean {
  if (error.response) return false;
  const code = String(error.code ?? '');
  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED') return false;
  if (/timeout/i.test(String(error.message ?? ''))) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return (
    code === 'ERR_NETWORK' ||
    /network error|failed to fetch/i.test(String(error.message ?? ''))
  );
}

/** Обрыв связи или отсутствие сети (в отличие от isConnectivityFailure — включая navigator.onLine=false). */
function isConnectivityOrOffline(error: AxiosError): boolean {
  if (error.response) return false;
  if (isCancel(error)) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return isTransientNetworkError(error) || String(error.code ?? '') === 'ECONNABORTED';
}

/** Ключ записи в локальной базе: путь + параметры запроса. */
function buildLocalDbUrl(config: InternalAxiosRequestConfig): string {
  const raw = config.url ?? '';
  const params = config.params as Record<string, unknown> | undefined;
  if (!params || typeof params !== 'object') return raw;
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return raw;
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  return `${raw}${raw.includes('?') ? '&' : '?'}${qs}`;
}

function hasActiveAuthSession(): boolean {
  try {
    return Boolean(useAuthStore.getState().token);
  } catch {
    return false;
  }
}

function applyBaseURL(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  config.baseURL = resolveAxiosBaseURL();
  return config;
}

apiClient.interceptors.request.use((config) => {
  const next = applyBaseURL(config) as RetryableAxiosConfig;
  next.withCredentials = true;
  const token = getTokenForRequest();
  // Cookie-only retry после 401: не возвращать устаревший Bearer из стора.
  if (next._retryCookieOnly) {
    stripStaleAuthorization(next);
  } else if (token && !isCookieOnlySessionToken(token)) {
    next.headers.Authorization = `Bearer ${token}`;
  } else if (next.headers && 'Authorization' in next.headers) {
    // Prevent stale bearer token after logout/session clear.
    delete (next.headers as Record<string, unknown>).Authorization;
  }
  // FormData: не удалять boundary — убираем только случайный явный Content-Type (multipart без boundary ломает загрузку).
  if (typeof FormData !== 'undefined' && next.data instanceof FormData && next.headers) {
    delete (next.headers as Record<string, unknown>)['Content-Type'];
  }
  return next;
});

apiClient.interceptors.response.use(
  (response) => {
    // Android: успешный GET сохраняем во внутреннюю SQLite, чтобы без сети показать последние данные.
    if (
      isLocalDbAvailable() &&
      response.config?.method?.toLowerCase() === 'get' &&
      response.config.responseType !== 'blob' &&
      response.config.responseType !== 'arraybuffer' &&
      response.status === 200 &&
      typeof response.data === 'object' &&
      response.data !== null &&
      !(response.headers as Record<string, unknown> | undefined)?.['x-local-db']
    ) {
      void localDbPut(buildLocalDbUrl(response.config), response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    if (isCancel(error)) {
      return Promise.reject(error);
    }

    const cfg = error.config as RetryableAxiosConfig | undefined;
    const url = cfg?.url ?? '';
    const status = error.response?.status;
    const bodyMsg = readResponseErrorMessage(error.response?.data);
    const tearingDown = isSessionTeardownActive();

    // Android: действие без сети (подтверждение участия, молитвенная нужда…) кладём в очередь SQLite —
    // оно уйдёт на сервер при появлении сети (lib/syncLocalDb).
    if (
      cfg &&
      isLocalDbAvailable() &&
      !tearingDown &&
      !cfg.skipLocalOutbox &&
      isQueueableWrite(cfg.method, cfg.url) &&
      isConnectivityOrOffline(error) &&
      (cfg._retryNetworkOnce || (typeof navigator !== 'undefined' && navigator.onLine === false))
    ) {
      let payload: unknown;
      try {
        payload = typeof cfg.data === 'string' && cfg.data ? JSON.parse(cfg.data) : cfg.data;
      } catch {
        payload = undefined;
      }
      if (await outboxAdd(cfg.method ?? 'post', cfg.url ?? '', payload)) {
        return {
          data: { queued: true },
          status: 202,
          statusText: 'Accepted (queued locally)',
          headers: { 'x-local-db-queued': '1' },
          config: cfg,
        };
      }
    }

    // Android: сервера не видно (нет сети) — отдаём последний ответ из внутренней SQLite.
    if (
      cfg &&
      isLocalDbAvailable() &&
      !tearingDown &&
      cfg.method?.toLowerCase() === 'get' &&
      cfg.responseType !== 'blob' &&
      cfg.responseType !== 'arraybuffer' &&
      isConnectivityOrOffline(error) &&
      (cfg._retryNetworkOnce || (typeof navigator !== 'undefined' && navigator.onLine === false))
    ) {
      const hit = await localDbGet(buildLocalDbUrl(cfg));
      if (hit) {
        return {
          data: hit.body,
          status: 200,
          statusText: 'OK (local)',
          headers: { 'x-local-db': String(hit.savedAt) },
          config: cfg,
        };
      }
    }

    // Краткий обрыв (рестарт контейнера / proxy): один повтор до toast.
    // Во время logout не ретраим — сессия уже снимается.
    if (!tearingDown && cfg && !cfg._retryNetworkOnce && isTransientNetworkError(error)) {
      cfg._retryNetworkOnce = true;
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, TRANSIENT_NETWORK_RETRY_DELAY_MS);
      });
      // За время ожидания мог начаться logout — не поднимаем мёртвую сессию.
      if (isSessionTeardownActive() || !hasActiveAuthSession()) {
        return Promise.reject(error);
      }
      return apiClient.request(cfg);
    }

    if (status === 401) {
      if (shouldSkip401Handling(url) || tearingDown || !hasActiveAuthSession()) {
        return Promise.reject(error);
      }

      const retryCfg = cfg;
      if (retryCfg && !retryCfg._retryAfterRefresh) {
        retryCfg._retryAfterRefresh = true;
        try {
          const refreshResult = await performAuthRefresh();
          if (isSessionTeardownActive() || !hasActiveAuthSession()) {
            return Promise.reject(error);
          }
          if (refreshResult.status === 'refreshed') {
            const auth = useAuthStore.getState();
            auth.setSession({
              token: refreshResult.token,
              firstName: auth.firstName,
              lastName: auth.lastName,
              role: auth.role,
              roles: auth.roles,
              registrationStatus: auth.registrationStatus,
              username: auth.username,
              memberId: auth.memberId,
            });
            stripStaleAuthorization(retryCfg);
            return apiClient.request(retryCfg);
          }

          // Refresh не помог: если слали Bearer, пробуем HttpOnly cookie (как realtime WS).
          const hadBearer =
            Boolean(readAuthorizationHeader(retryCfg)) ||
            Boolean(getTokenForRequest() && !isCookieOnlySessionToken(getTokenForRequest()));
          if (hadBearer && !retryCfg._retryCookieOnly) {
            retryCfg._retryCookieOnly = true;
            retryCfg._suppressAuthClear = true;
            stripStaleAuthorization(retryCfg);
            try {
              const cookieResponse = await apiClient.request(retryCfg);
              switchSessionToCookieOnly();
              return cookieResponse;
            } catch {
              /* cookie тоже не приняли — ниже по статусу refresh */
            } finally {
              retryCfg._suppressAuthClear = false;
            }
          }

          if (refreshResult.status === 'unchanged') {
            // 429 / сеть / 5xx на refresh: сессию не рвём — пользователь остаётся «внутри», следующий refresh или ручной повтор сработают.
            return Promise.reject(error);
          }
        } catch {
          return Promise.reject(error);
        }
      }

      if (cfg?._suppressAuthClear) {
        return Promise.reject(error);
      }

      // Фоновые sync-запросы (push subscribe и т.п.) не должны выкидывать пользователя.
      if (cfg?.skipAuthClearOn401) {
        return Promise.reject(error);
      }

      if (isSessionTeardownActive() || !hasActiveAuthSession()) {
        return Promise.reject(error);
      }

      try {
        useAuthStore.getState().clearSession();
      } catch {
        /* store недоступен (SSR и т.п.) */
      }
      emitAppToast({ message: bodyMsg ?? 'Сессия недействительна или истекла. Войдите снова.', kind: 'error' });
      return Promise.reject(error);
    } else if (!tearingDown && !cfg?.silentErrorToast && !isDocumentHidden() && hasActiveAuthSession()) {
      if (!error.response) {
        // Только реальный ERR_NETWORK — таймауты и offline не маскируем под «нет связи с API».
        if (
          isConnectivityFailure(error) &&
          shouldEmitCooldownToast(lastNetworkToastAt, NETWORK_TOAST_COOLDOWN_MS)
        ) {
          markCooldownToast('network');
          emitAppToast({
            message: 'Нет связи с сервером. Проверьте интернет и доступность API.',
            kind: 'error',
            adminOnly: true,
          });
        }
      } else if (status != null && status >= 500) {
        if (shouldEmitCooldownToast(lastServerErrorToastAt, SERVER_ERROR_TOAST_COOLDOWN_MS)) {
          markCooldownToast('server');
          emitAppToast({
            message:
              bodyMsg ??
              formatApiFailureHint(status, url, 'Сервер временно недоступен. Попробуйте через несколько минут.'),
            kind: 'error',
            adminOnly: true,
          });
        }
      } else if (status === 403) {
        emitAppToast({
          message:
            bodyMsg ?? 'Недостаточно прав для действия. Если роль изменилась, обновите страницу.',
          kind: 'error',
          adminOnly: true,
        });
      }
    }

    return Promise.reject(error);
  },
);
