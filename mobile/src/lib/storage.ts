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

const LS_TOKEN = 'auth_access_token';
const LS_FIRST = 'auth_first_name';
const LS_LAST = 'auth_last_name';
const LS_ROLE = 'auth_role';
const LS_REG = 'auth_registration_status';
const LS_USERNAME = 'auth_username';
const LS_MEMBER_ID = 'auth_member_id';

export function getAuthToken(): string | null {
  return storage.getString(LS_TOKEN) ?? null;
}

export function setAuthToken(token: string | null): void {
  if (token) {
    storage.set(LS_TOKEN, token);
  } else {
    storage.remove(LS_TOKEN);
  }
}

export function clearAuthSession(): void {
  storage.remove(LS_TOKEN);
  storage.remove(LS_FIRST);
  storage.remove(LS_LAST);
  storage.remove(LS_ROLE);
  storage.remove(LS_REG);
  storage.remove(LS_USERNAME);
  storage.remove(LS_MEMBER_ID);
}

export function persistAuthProfile(profile: {
  firstName: string;
  lastName: string;
  role: string;
  registrationStatus: string;
  username: string;
  memberId: number | null;
}): void {
  storage.set(LS_FIRST, profile.firstName);
  storage.set(LS_LAST, profile.lastName);
  storage.set(LS_ROLE, profile.role);
  storage.set(LS_REG, profile.registrationStatus);
  storage.set(LS_USERNAME, profile.username);
  if (profile.memberId != null) {
    storage.set(LS_MEMBER_ID, String(profile.memberId));
  } else {
    storage.remove(LS_MEMBER_ID);
  }
}

export function readAuthProfile(): {
  firstName: string;
  lastName: string;
  role: string;
  registrationStatus: string;
  username: string;
  memberId: number | null;
} {
  const memberIdRaw = storage.getString(LS_MEMBER_ID);
  const memberId = memberIdRaw ? Number(memberIdRaw) : null;
  return {
    firstName: storage.getString(LS_FIRST) ?? '',
    lastName: storage.getString(LS_LAST) ?? '',
    role: storage.getString(LS_ROLE) ?? 'member',
    registrationStatus: storage.getString(LS_REG) ?? 'active',
    username: storage.getString(LS_USERNAME) ?? '',
    memberId: Number.isFinite(memberId) ? memberId : null,
  };
}
