import { Platform } from 'react-native';

import { getApiBaseUrl } from './storage';

/** Публичный origin production (nginx отдаёт и SPA, и `/api`). */
export const PRODUCTION_API_ORIGIN = 'https://app.church-tambov.ru';

const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:40978';
const DEFAULT_LOCAL_HOST = 'http://localhost:40978';

function trimOrigin(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

/** Origin из EAS / `.env` (`EXPO_PUBLIC_API_ORIGIN`), без ручного override. */
export function getEnvApiOrigin(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_ORIGIN ?? '';
  return trimOrigin(fromEnv);
}

/**
 * Дефолт без MMKV-override:
 * 1) `EXPO_PUBLIC_API_ORIGIN` (EAS preview/production)
 * 2) `__DEV__` → эмулятор / localhost
 * 3) иначе production HTTPS
 */
export function getDefaultApiOrigin(): string {
  const fromEnv = getEnvApiOrigin();
  if (fromEnv) return fromEnv;
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return Platform.OS === 'android' ? ANDROID_EMULATOR_HOST : DEFAULT_LOCAL_HOST;
  }
  return PRODUCTION_API_ORIGIN;
}

export function resolveApiOrigin(): string {
  const override = trimOrigin(getApiBaseUrl());
  if (override !== '') return override;
  return getDefaultApiOrigin();
}

export const AUTH_API_PREFIX = '/api/auth';

export function resolveRealtimeWebSocketUrl(): string {
  const httpBase = resolveApiOrigin();
  if (!httpBase) return '';
  try {
    const u = new URL(httpBase.includes('://') ? httpBase : `http://${httpBase}`);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = '/api/realtime';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return '';
  }
}
