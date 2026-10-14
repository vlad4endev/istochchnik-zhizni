import { Capacitor } from '@capacitor/core';

/**
 * Auth token storage:
 * - native → Keychain / Keystore via capacitor-secure-storage-plugin
 * - web → localStorage (same keys as before for PWA continuity)
 */

const AUTH_KEYS = [
  'auth_access_token',
  'auth_first_name',
  'auth_last_name',
  'auth_role',
  'auth_registration_status',
] as const;

export type AuthStorageKey = (typeof AUTH_KEYS)[number];

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

async function secureGet(key: string): Promise<string | null> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    const { value } = await SecureStoragePlugin.get({ key });
    return value ?? null;
  } catch {
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
  await SecureStoragePlugin.set({ key, value });
}

async function secureRemove(key: string): Promise<void> {
  try {
    const { SecureStoragePlugin } = await import('capacitor-secure-storage-plugin');
    await SecureStoragePlugin.remove({ key });
  } catch {
    /* missing key */
  }
}

export async function getSecureItem(key: AuthStorageKey | string): Promise<string | null> {
  if (!isNative()) {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }
  const v = await secureGet(key);
  if (v != null) return v;
  // One-time migrate from localStorage → secure storage
  if (typeof localStorage !== 'undefined') {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      try {
        await secureSet(key, legacy);
        localStorage.removeItem(key);
      } catch {
        return legacy;
      }
      return legacy;
    }
  }
  return null;
}

export async function setSecureItem(key: AuthStorageKey | string, value: string): Promise<void> {
  if (!isNative()) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  await secureSet(key, value);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}

export async function removeSecureItem(key: AuthStorageKey | string): Promise<void> {
  if (!isNative()) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  await secureRemove(key);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}

/**
 * Synchronous read for Zustand hydrate on web; on native returns localStorage
 * cache if present (pre-migration) else null — async hydrate fills secure values.
 */
export function getSecureItemSync(key: AuthStorageKey | string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}

export async function hydrateAuthKeysFromSecureStorage(): Promise<Record<string, string>> {
  if (!isNative()) return {};
  const out: Record<string, string> = {};
  for (const key of AUTH_KEYS) {
    const v = await getSecureItem(key);
    if (v != null) out[key] = v;
  }
  return out;
}
