import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { useAuthStore } from '../features/auth/authStore';
import { apiClient } from '../lib/apiClient';

const DEVICE_ID_KEY = 'fcm_push_device_id';
const MESSAGES_CHANNEL_ID = 'messages';
const MESSAGES_CHANNEL_NAME = 'Сообщения';
const MESSAGES_CHANNEL_DESCRIPTION = 'Личные и групповые сообщения';
const GENERAL_CHANNEL_ID = 'general';
const GENERAL_CHANNEL_NAME = 'Уведомления';
const GENERAL_CHANNEL_DESCRIPTION = 'Напоминания и системные уведомления';

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

async function saveFcmTokenToServer(fcmToken: string, deviceId: string): Promise<void> {
  const session = useAuthStore.getState().token;
  if (!session?.trim()) return;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await apiClient.post('/api/notifications/save-token', {
        fcm_token: fcmToken,
        device_id: deviceId,
      });
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  console.warn('[fcm] save-token failed after retries', lastErr);
}

async function ensurePushChannels(): Promise<void> {
  await PushNotifications.createChannel({
    id: MESSAGES_CHANNEL_ID,
    name: MESSAGES_CHANNEL_NAME,
    description: MESSAGES_CHANNEL_DESCRIPTION,
    importance: 5,
    visibility: 1,
    vibration: true,
    sound: 'default',
    lights: true,
    lightColor: '#7d3640',
  }).catch(() => {});

  await PushNotifications.createChannel({
    id: GENERAL_CHANNEL_ID,
    name: GENERAL_CHANNEL_NAME,
    description: GENERAL_CHANNEL_DESCRIPTION,
    importance: 4,
    visibility: 1,
    vibration: true,
    sound: 'default',
    lights: false,
  }).catch(() => {});
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
        await ensurePushChannels();
        const perm = await PushNotifications.requestPermissions();
        if (cancelled) return;
        if (perm.receive !== 'granted') {
          console.warn('[fcm] notification permission not granted');
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
      await saveFcmTokenToServer(fcmToken, deviceId);
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

    const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data ?? {};
      const url = typeof data.url === 'string' ? data.url : '';
      const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
      window.dispatchEvent(
        new CustomEvent('app:native-push-navigate', {
          detail: { url, conversationId },
        }),
      );
    });

    return () => {
      cancelled = true;
      void regListener.then((h) => h.remove());
      void regErrorListener.then((h) => h.remove());
      void receivedListener.then((h) => h.remove());
      void actionListener.then((h) => h.remove());
    };
  }, [token]);
}
