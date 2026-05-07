import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { useAuthStore } from '../features/auth/authStore';
import { apiClient } from '../lib/apiClient';

const DEVICE_ID_KEY = 'fcm_push_device_id';
const MESSAGES_CHANNEL_ID = 'messages';
const MESSAGES_CHANNEL_NAME = 'Сообщения';
const MESSAGES_CHANNEL_DESCRIPTION = 'Личные и групповые сообщения';

function getOrCreateDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id?.trim()) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function showForegroundNotification(title: string, body: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('app:toast', {
      detail: {
        title: title || 'Уведомление',
        message: body || '',
        kind: 'info' as const,
      },
    }),
  );
}

/**
 * Нативные FCM-пуши (Capacitor). На веб/PWA не выполняется.
 * Токен отправляется на POST /api/notifications/save-token при наличии сессии.
 */
export function useFCM(): void {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    if (!token?.trim()) {
      return;
    }

    const deviceId = getOrCreateDeviceId();

    let cancelled = false;

    void (async () => {
      try {
        // Отдельный канал для чатов: высокий приоритет + звук/вибрация.
        await PushNotifications.createChannel({
          id: MESSAGES_CHANNEL_ID,
          name: MESSAGES_CHANNEL_NAME,
          description: MESSAGES_CHANNEL_DESCRIPTION,
          importance: 5,
          visibility: 1,
          vibration: true,
          sound: 'default',
          lights: true,
          lightColor: '#2dd4bf',
        }).catch(() => {
          // Канал мог уже существовать.
        });
        const perm = await PushNotifications.requestPermissions();
        if (cancelled) return;
        if (perm.receive !== 'granted') {
          return;
        }
        await PushNotifications.register();
      } catch (e) {
        console.warn('[fcm] request/register failed', e);
      }
    })();

    const regListener = PushNotifications.addListener('registration', async (ev) => {
      const fcmToken = ev.value?.trim();
      if (!fcmToken) return;
      const session = useAuthStore.getState().token;
      if (!session?.trim()) return;
      try {
        await apiClient.post('/api/notifications/save-token', {
          fcm_token: fcmToken,
          device_id: deviceId,
        });
      } catch (err) {
        console.warn('[fcm] save-token failed', err);
      }
    });

    const regErrorListener = PushNotifications.addListener('registrationError', (err) => {
      console.warn('[fcm] registrationError', err);
    });

    const receivedListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title =
        typeof notification.notification?.title === 'string'
          ? notification.notification.title
          : typeof notification.data?.title === 'string'
            ? notification.data.title
            : '';
      const body =
        typeof notification.notification?.body === 'string'
          ? notification.notification.body
          : typeof notification.data?.body === 'string'
            ? notification.data.body
            : '';
      showForegroundNotification(title, body);
    });

    return () => {
      cancelled = true;
      void regListener.then((h) => h.remove());
      void regErrorListener.then((h) => h.remove());
      void receivedListener.then((h) => h.remove());
    };
  }, [token]);
}
