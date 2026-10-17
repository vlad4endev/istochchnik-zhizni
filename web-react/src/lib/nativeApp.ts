import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { NativeCall } from '../plugins/nativeCall';

export type NativePermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

export async function queryNativePushPermission(): Promise<NativePermissionState> {
  if (!isCapacitorNative()) return 'unknown';
  try {
    const check = await PushNotifications.checkPermissions();
    if (check.receive === 'granted') return 'granted';
    if (check.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

export async function requestNativePushPermission(): Promise<NativePermissionState> {
  if (!isCapacitorNative()) return 'unknown';
  try {
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app:native-push-permissions-granted'));
      }
      return 'granted';
    }
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}

/**
 * Системные настройки уведомлений приложения. После отказа Android 13+ и iOS больше не показывают
 * запрос — единственный путь включить пуши это настройки. Возвращает false, если открыть не удалось.
 */
export async function openNativeNotificationSettings(): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  try {
    await NativeCall.openNotificationSettings?.();
    return true;
  } catch {
    return false;
  }
}
