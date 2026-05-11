import axios, { type AxiosError, type AxiosHeaders, type InternalAxiosRequestConfig, isCancel } from 'axios';

import { useAuthStore } from '../features/auth/authStore';

import { performAuthRefresh } from './authRefresh';
import { isCookieOnlySessionToken } from './authSessionConstants';
import { resolveAxiosBaseURL } from './config';
import { emitAppToast } from './uiFeedback';

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
};

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
  const next = applyBaseURL(config);
  next.withCredentials = true;
  const token = getTokenForRequest();
  if (token && !isCookieOnlySessionToken(token)) {
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
      const retryCfg = cfg as RetryableAxiosConfig | undefined;
      if (!shouldSkip401Handling(url) && retryCfg && !retryCfg._retryAfterRefresh) {
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
          if (refreshResult.status === 'unchanged') {
            // 429 / сеть: не сбрасывать сессию; повтор с тем же токеном даст цикл при истёкшем access — просто пробрасываем 401.
            return Promise.reject(error);
          }
        } catch {
          // fallthrough: clear session + notify below
        }
      }
      if (!shouldSkip401Handling(url)) {
        try {
          useAuthStore.getState().clearSession();
        } catch {
          /* store недоступен (SSR и т.п.) */
        }
        emitAppToast({ message: bodyMsg ?? 'Сессия недействительна или истекла. Войдите снова.', kind: 'error' });
      }
    } else if (!error.response) {
      emitAppToast({
        message: 'Нет связи с сервером. Проверьте интернет и доступность API.',
        kind: 'error',
        adminOnly: true,
      });
    } else if (status != null && status >= 500) {
      emitAppToast({
        message: bodyMsg ?? formatApiFailureHint(status, url, 'Сервер временно недоступен. Попробуйте через несколько минут.'),
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

    return Promise.reject(error);
  },
);
