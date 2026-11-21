import { Platform } from 'react-native';

import { removeFcmToken, saveFcmToken } from '../api/push';
import { createClientMsgId } from '../lib/messengerUtils';
import { storage } from '../lib/storage';
import { ensureCallNotificationSetup } from './callNotifications';
import { getNotifications, getPushTransport } from './pushNative';

const DEVICE_ID_KEY = 'push_device_id';

/** Постоянный идентификатор этой установки: по нему сервер хранит и удаляет токен. */
export function getDeviceId(): string {
  const existing = storage.getString(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = `rn-${Platform.OS}-${createClientMsgId()}`;
  storage.set(DEVICE_ID_KEY, id);
  return id;
}

export type PushSetupResult = 'ok' | 'unsupported' | 'denied' | 'error';

/** Просит разрешение на уведомления, готовит каналы и передаёт серверу токен устройства. */
export async function registerPush(): Promise<PushSetupResult> {
  const transport = getPushTransport();
  const N = getNotifications();
  if (!transport || !N) return 'unsupported';
  try {
    await ensureCallNotificationSetup();
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    if (Platform.OS === 'ios') await transport.registerForRemoteMessages();
    const token = await transport.getToken();
    if (!token) return 'error';
    await saveFcmToken(token, getDeviceId());
    return 'ok';
  } catch {
    return 'error';
  }
}

/** Подписка на смену токена: Firebase может выдать новый в любой момент. */
export function watchTokenRefresh(): () => void {
  const transport = getPushTransport();
  if (!transport) return () => undefined;
  return transport.onTokenRefresh((token) => {
    void saveFcmToken(token, getDeviceId()).catch(() => undefined);
  });
}

/** Выход из аккаунта: больше не получать на этом телефоне чужие звонки. */
export async function unregisterPush(): Promise<void> {
  try {
    await removeFcmToken(getDeviceId());
  } catch {
    /* нет сети: токен удалится по ошибке доставки */
  }
}
