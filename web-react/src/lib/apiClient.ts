import axios, { type InternalAxiosRequestConfig } from 'axios';

import { useAuthStore } from '../features/auth/authStore';

import { resolveAxiosBaseURL } from './config';

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
});

function applyBaseURL(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  config.baseURL = resolveAxiosBaseURL();
  return config;
}

apiClient.interceptors.request.use((config) => {
  const next = applyBaseURL(config);
  const token = getTokenForRequest();
  if (token) {
    next.headers.Authorization = `Bearer ${token}`;
  }
  return next;
});
