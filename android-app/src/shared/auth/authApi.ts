import axios from 'axios';

import {apiClient} from '../apiClient';
import {getAuthApiBaseUrl, resolveApiBaseUrl} from '../config';
import {
  clearSecureToken,
  loadSecureToken,
  saveSecureToken,
} from '../storage/secureStorage';
import type {AuthMeResponse, AuthProfile} from './types';
import {mapAuthMeToProfile} from './types';

export interface LoginResponse {
  token?: string;
  access_token?: string;
  first_name?: string;
  last_name?: string;
  app_role?: string;
  app_roles?: string[];
  registration_status?: string;
  username?: string;
  id?: number;
}

function extractToken(data: LoginResponse): string | null {
  const t = data.token ?? data.access_token;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export async function loginRequest(
  phoneNumber: string,
  password: string,
): Promise<{ok: true; token: string; profile: AuthProfile} | {ok: false; message: string}> {
  try {
    const {data} = await axios.post<LoginResponse>(
      `${getAuthApiBaseUrl()}/login`,
      {phone_number: phoneNumber, password},
      {timeout: 25_000},
    );
    const token = extractToken(data);
    if (!token) {
      return {ok: false, message: 'Сервер не вернул токен'};
    }
    const profile = mapAuthMeToProfile(data);
    await saveSecureToken(token);
    return {ok: true, token, profile};
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const msg =
        typeof e.response?.data === 'object' &&
        e.response.data !== null &&
        'error' in e.response.data &&
        typeof (e.response.data as {error: unknown}).error === 'string'
          ? (e.response.data as {error: string}).error
          : 'Неверный телефон или пароль';
      return {ok: false, message: msg};
    }
    return {ok: false, message: 'Ошибка сети'};
  }
}

export async function fetchMe(): Promise<AuthProfile | null> {
  const token = await loadSecureToken();
  if (!token) return null;
  const {data} = await apiClient.get<AuthMeResponse>('/api/auth/me');
  return mapAuthMeToProfile(data);
}

export async function refreshTokenRequest(): Promise<string | null> {
  try {
    const {data} = await axios.post<LoginResponse>(
      `${resolveApiBaseUrl()}/api/auth/refresh`,
      {},
      {
        timeout: 15_000,
        headers: {
          Authorization: `Bearer ${await loadSecureToken()}`,
        },
      },
    );
    const token = extractToken(data);
    if (token) await saveSecureToken(token);
    return token;
  } catch {
    return null;
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } catch {
    /* ignore */
  } finally {
    await clearSecureToken();
  }
}
