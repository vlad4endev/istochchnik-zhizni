import axios, { type AxiosError, type InternalAxiosRequestConfig, isCancel } from 'axios';

import { useAuthStore } from '../features/auth/authStore';
import { useLoadingStore } from '../stores/loadingStore';

import { isCookieOnlySessionToken } from './authSessionConstants';
import { resolveAxiosBaseURL } from './config';

const AUTH_PATHS_SKIP_401_HANDLING = ['/api/auth/login', '/api/auth/register'];

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

function emitApiWarning(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:api-warning', { detail: { message } }));
}

function emitApiClearWarning(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app:api-clear-warning'));
}

function getTokenForRequest(): string | null {
  try {
    return useAuthStore.getState().token;
  } catch {
    return null;
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
  useLoadingStore.getState().start();
  const next = applyBaseURL(config);
  next.withCredentials = true;
  const token = getTokenForRequest();
  if (token && !isCookieOnlySessionToken(token)) {
    next.headers.Authorization = `Bearer ${token}`;
  } else if (next.headers && 'Authorization' in next.headers) {
    // Prevent stale bearer token after logout/session clear.
    delete (next.headers as Record<string, unknown>).Authorization;
  }
  return next;
});

apiClient.interceptors.response.use(
  (response) => {
    useLoadingStore.getState().done();
    emitApiClearWarning();
    return response;
  },
  (error: AxiosError) => {
    useLoadingStore.getState().done();
    if (isCancel(error)) {
      return Promise.reject(error);
    }

    const cfg = error.config;
    const url = cfg?.url ?? '';
    const status = error.response?.status;
    const bodyMsg = readResponseErrorMessage(error.response?.data);

    if (status === 401) {
      if (!shouldSkip401Handling(url)) {
        try {
          useAuthStore.getState().clearSession();
        } catch {
          /* store недоступен (SSR и т.п.) */
        }
        emitApiWarning(bodyMsg ?? 'Сессия недействительна или истекла. Войдите снова.');
      }
    } else if (!error.response) {
      emitApiWarning('Нет связи с сервером. Проверьте интернет и доступность API.');
    } else if (status != null && status >= 500) {
      emitApiWarning(bodyMsg ?? formatApiFailureHint(status, url, 'Сервер временно недоступен. Попробуйте через несколько минут.'));
    } else if (status === 403) {
      emitApiWarning(
        bodyMsg ?? 'Недостаточно прав для действия. Если роль изменилась, обновите страницу.',
      );
    }

    return Promise.reject(error);
  },
);
