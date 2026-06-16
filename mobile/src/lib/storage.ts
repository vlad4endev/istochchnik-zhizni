import { createMMKV } from 'react-native-mmkv';

import type { AppSettings } from '../types';

export const storage = createMMKV();

const COLOR_SCHEMES: AppSettings['colorScheme'][] = ['system', 'light', 'dark'];

export function getApiBaseUrl(): string {
  return storage.getString('apiBaseUrl') ?? '';
}

export function setApiBaseUrl(url: string): void {
  storage.set('apiBaseUrl', url);
}

export function getColorScheme(): AppSettings['colorScheme'] {
  const scheme = storage.getString('colorScheme');
  if (scheme && COLOR_SCHEMES.includes(scheme as AppSettings['colorScheme'])) {
    return scheme as AppSettings['colorScheme'];
  }
  return 'system';
}

export function setColorScheme(scheme: AppSettings['colorScheme']): void {
  storage.set('colorScheme', scheme);
}
