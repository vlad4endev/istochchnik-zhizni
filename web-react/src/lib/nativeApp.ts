import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

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
      await PushNotifications.register();
      return 'granted';
    }
    if (perm.receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unknown';
  }
}
