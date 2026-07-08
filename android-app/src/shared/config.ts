import Config from 'react-native-config';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveApiBaseUrl(): string {
  const raw = Config.API_BASE_URL ?? '';
  return trimTrailingSlash(String(raw).trim());
}

export const AUTH_API_PREFIX = '/api/auth';
export const SYNC_API_PREFIX = '/api/sync';

export function getAuthApiBaseUrl(): string {
  return `${resolveApiBaseUrl()}${AUTH_API_PREFIX}`;
}

export function getSyncApiBaseUrl(): string {
  return `${resolveApiBaseUrl()}${SYNC_API_PREFIX}`;
}
