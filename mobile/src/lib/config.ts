import { Platform } from 'react-native';

import { getApiBaseUrl } from './storage';

const ANDROID_EMULATOR_HOST = 'http://10.0.2.2:40978';
const DEFAULT_LOCAL_HOST = 'http://localhost:40978';

export function resolveApiOrigin(): string {
  const raw = getApiBaseUrl().trim();
  if (raw !== '') {
    return raw.replace(/\/$/, '');
  }
  if (Platform.OS === 'android') {
    return ANDROID_EMULATOR_HOST;
  }
  return DEFAULT_LOCAL_HOST;
}

export const AUTH_API_PREFIX = '/api/auth';

export function resolveRealtimeWebSocketUrl(): string {
  const httpBase = resolveApiOrigin().trim();
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
