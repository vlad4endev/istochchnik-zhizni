import * as Keychain from 'react-native-keychain';

const SERVICE = 'istochnik.auth.token';

export async function saveSecureToken(token: string): Promise<void> {
  await Keychain.setGenericPassword('auth', token, {service: SERVICE});
}

export async function loadSecureToken(): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({service: SERVICE});
  if (!creds) return null;
  return creds.password || null;
}

export async function clearSecureToken(): Promise<void> {
  await Keychain.resetGenericPassword({service: SERVICE});
}

const DEVICE_ID_SERVICE = 'istochnik.device.id';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await Keychain.getGenericPassword({service: DEVICE_ID_SERVICE});
  if (existing && typeof existing !== 'boolean' && existing.password) {
    return existing.password;
  }
  const id = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await Keychain.setGenericPassword('device', id, {service: DEVICE_ID_SERVICE});
  return id;
}
