import { useCallback } from 'react';
import { initMessengerPushNotifications } from '../messenger/push/webPush';

const LS_PUSH_ASKED = 'push-asked';

export function usePushNotifications() {
  const isSupported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const requestPermission = useCallback(async (): Promise<NotificationPermission | 'unsupported'> => {
    if (!isSupported) return 'unsupported';
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await initMessengerPushNotifications();
    }
    return result;
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    if (Notification.permission !== 'granted') {
      const result = await requestPermission();
      if (result !== 'granted') return;
      return;
    }
    await initMessengerPushNotifications();
  }, [isSupported, requestPermission]);

  return { requestPermission, subscribe, isSupported };
}

export function wasPushPermissionAsked(): boolean {
  try {
    return localStorage.getItem(LS_PUSH_ASKED) === 'true';
  } catch {
    return false;
  }
}

export function markPushPermissionAsked(): void {
  try {
    localStorage.setItem(LS_PUSH_ASKED, 'true');
  } catch {
    /* ignore */
  }
}
