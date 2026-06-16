import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { resolveApiOrigin } from '../lib/config';
import { getAuthToken } from '../lib/storage';

const AUTH_PATHS_SKIP_401 = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

function shouldSkip401(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_PATHS_SKIP_401.some((p) => url.includes(p));
}

function readErrorMessage(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error: unknown }).error;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  }
  return null;
}

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const apiClient = axios.create({
  timeout: 25_000,
  headers: { Accept: 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = resolveApiOrigin();
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    const status = error.response?.status;
    const url = config?.url;

    if (status === 401 && config && !config._retry && !shouldSkip401(url)) {
      config._retry = true;
      const { useAuthStore } = await import('../stores/authStore');
      useAuthStore.getState().clearSession();
    }

    const msg =
      readErrorMessage(error.response?.data) ??
      (status ? `Ошибка ${status}` : 'Нет соединения с сервером');
    return Promise.reject(new Error(msg));
  },
);

export function formatApiError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
