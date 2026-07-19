import axios, { type AxiosError, type AxiosHeaders, type InternalAxiosRequestConfig, isCancel } from 'axios';

import { useAuthStore } from '../features/auth/authStore';

import { performAuthRefresh } from './authRefresh';
import { COOKIE_ONLY_SESSION_TOKEN, isCookieOnlySessionToken } from './authSessionConstants';
import { resolveAxiosBaseURL } from './config';
import { emitAppToast } from './uiFeedback';

declare module 'axios' {
  export interface AxiosRequestConfig {
    /** Не показывать глобальный toast при ошибке ответа. */
    silentErrorToast?: boolean;
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
  /** Зонд cookie-only: не чистить сессию в этом проходе — решает внешний 401-handler. */
  _suppressAuthClear?: boolean;
  /** Не показывать глобальный toast при 4xx/5xx (ошибку обрабатывает экран). */
  silentErrorToast?: boolean;
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
  (response) => response,
  async (error: AxiosError) => {
    if (isCancel(error)) {
      return Promise.reject(error);
    }

    const cfg = error.config;
    const url = cfg?.url ?? '';
    const status = error.response?.status;
    const bodyMsg = readResponseErrorMessage(error.response?.data);

    if (status === 401) {
      if (shouldSkip401Handling(url)) {
        return Promise.reject(error);
      }

      const retryCfg = cfg as RetryableAxiosConfig | undefined;
      if (retryCfg && !retryCfg._retryAfterRefresh) {
        retryCfg._retryAfterRefresh = true;
        try {
          const refreshResult = await performAuthRefresh();
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

      if ((cfg as RetryableAxiosConfig | undefined)?._suppressAuthClear) {
        return Promise.reject(error);
      }

      try {
        useAuthStore.getState().clearSession();
      } catch {
        /* store недоступен (SSR и т.п.) */
      }
      emitAppToast({ message: bodyMsg ?? 'Сессия недействительна или истекла. Войдите снова.', kind: 'error' });
      return Promise.reject(error);
    } else if (!(cfg as RetryableAxiosConfig | undefined)?.silentErrorToast) {
      if (!error.response) {
        emitAppToast({
          message: 'Нет связи с сервером. Проверьте интернет и доступность API.',
          kind: 'error',
          adminOnly: true,
        });
      } else if (status != null && status >= 500) {
        emitAppToast({
          message:
            bodyMsg ??
            formatApiFailureHint(status, url, 'Сервер временно недоступен. Попробуйте через несколько минут.'),
          kind: 'error',
          adminOnly: true,
        });
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
