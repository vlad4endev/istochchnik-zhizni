import axios, {type AxiosError, type InternalAxiosRequestConfig} from 'axios';

import {resolveApiBaseUrl} from './config';

type TokenGetter = () => string | null;

let tokenGetter: TokenGetter = () => null;

export function setApiTokenGetter(getter: TokenGetter): void {
  tokenGetter = getter;
}

const AUTH_PATHS_SKIP_401 = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

function shouldSkip401(url: string | undefined): boolean {
  if (!url) return false;
  return AUTH_PATHS_SKIP_401.some(p => url.includes(p));
}

function readResponseErrorMessage(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as {error: unknown}).error;
    return typeof e === 'string' && e.trim() ? e.trim() : null;
  }
  return null;
}

export const apiClient = axios.create({
  timeout: 25_000,
  headers: {Accept: 'application/json'},
});

apiClient.interceptors.request.use(config => {
  config.baseURL = resolveApiBaseUrl();
  const token = tokenGetter();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

type RetryConfig = InternalAxiosRequestConfig & {_retryAfterRefresh?: boolean};

let refreshHandler: (() => Promise<string | null>) | null = null;

export function setAuthRefreshHandler(handler: () => Promise<string | null>): void {
  refreshHandler = handler;
}

apiClient.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;
    if (!config || config._retryAfterRefresh || error.response?.status !== 401) {
      return Promise.reject(error);
    }
    if (shouldSkip401(config.url)) {
      return Promise.reject(error);
    }
    if (!refreshHandler) {
      return Promise.reject(error);
    }
    config._retryAfterRefresh = true;
    const newToken = await refreshHandler();
    if (!newToken) {
      return Promise.reject(error);
    }
    config.headers.Authorization = `Bearer ${newToken}`;
    return apiClient.request(config);
  },
);

export function getApiErrorMessage(error: unknown, fallback = 'Ошибка запроса'): string {
  if (axios.isAxiosError(error)) {
    return readResponseErrorMessage(error.response?.data) ?? fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
