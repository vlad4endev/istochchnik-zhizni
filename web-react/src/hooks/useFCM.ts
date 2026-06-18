import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { useAuthStore } from '../features/auth/authStore';
import { isCookieOnlySessionToken } from '../lib/authSessionConstants';
import { resolveAxiosBaseURL } from '../lib/config';
import { apiClient } from '../lib/apiClient';
import { emitAppToast } from '../lib/uiFeedback';

const DEVICE_ID_KEY = 'fcm_push_device_id';
const MESSAGES_CHANNEL_ID = 'messages';
const MESSAGES_CHANNEL_NAME = 'Сообщения';
const MESSAGES_CHANNEL_DESCRIPTION = 'Личные и групповые сообщения';
const GENERAL_CHANNEL_ID = 'general';
const GENERAL_CHANNEL_NAME = 'Уведомления';
const GENERAL_CHANNEL_DESCRIPTION = 'Напоминания и системные уведомления';

/** Последний FCM-токен с устройства — пересохраняем при входе, если registration уже прошёл. */
let lastRegisteredFcmToken: string | null = null;

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

async function postSaveTokenRequest(
  fcmToken: string,
  deviceId: string,
  sessionToken: string,
): Promise<boolean> {
  const base = resolveAxiosBaseURL().trim();
  if (!base) return false;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (!isCookieOnlySessionToken(sessionToken)) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const res = await fetch(`${base}/api/notifications/save-token`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ fcm_token: fcmToken, device_id: deviceId }),
  });
  return res.ok;
}

async function saveFcmTokenToServer(fcmToken: string, deviceId: string): Promise<boolean> {
  const session = useAuthStore.getState().token;
  if (!session?.trim()) return false;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await apiClient.post('/api/notifications/save-token', {
        fcm_token: fcmToken,
        device_id: deviceId,
      });
      return true;
    } catch (err) {
      lastErr = err;
      try {
        if (await postSaveTokenRequest(fcmToken, deviceId, session)) {
          return true;
        }
      } catch (fetchErr) {
        lastErr = fetchErr;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  console.warn('[fcm] save-token failed after retries', lastErr, resolveAxiosBaseURL());
  emitAppToast('Не удалось отправить push-токен на сервер. Проверьте интернет и войдите снова.', 'error');
  return false;
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

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await PushNotifications.checkPermissions();
  if (current.receive === 'granted') return true;
  const perm = await PushNotifications.requestPermissions();
  return perm.receive === 'granted';
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
    const removeListeners: Array<() => void> = [];

    const registerForPush = async (): Promise<void> => {
      if (cancelled) return;
      if (!(await ensureNotificationPermission())) {
        console.warn('[fcm] notification permission not granted');
        emitAppToast(
          'Уведомления отключены. Настройки → Приложения → Источник жизни → Уведомления → разрешить.',
          'error',
        );
        return;
      }
      if (lastRegisteredFcmToken) {
        const ok = await saveFcmTokenToServer(lastRegisteredFcmToken, deviceId);
        if (ok) {
          emitAppToast('Push-уведомления подключены', 'success');
        }
      }
      await PushNotifications.register();
    };

    void (async () => {
      try {
        await ensurePushChannels();

        const regListener = await PushNotifications.addListener('registration', async (ev) => {
          const fcmToken = ev.value?.trim();
          if (!fcmToken) return;
          lastRegisteredFcmToken = fcmToken;
          const ok = await saveFcmTokenToServer(fcmToken, deviceId);
          if (ok) {
            emitAppToast('Push-уведомления подключены', 'success');
          }
        });
        removeListeners.push(() => {
          void regListener.remove();
        });

        const regErrorListener = await PushNotifications.addListener('registrationError', (err) => {
          console.warn('[fcm] registrationError', err);
          const msg =
            err && typeof err === 'object' && 'error' in err && typeof (err as { error?: unknown }).error === 'string'
              ? (err as { error: string }).error
              : 'FCM registration failed';
          emitAppToast(`Ошибка регистрации push: ${msg}`, 'error');
        });
        removeListeners.push(() => {
          void regErrorListener.remove();
        });

        const receivedListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
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
        removeListeners.push(() => {
          void receivedListener.remove();
        });

        const actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification?.data ?? {};
          const url = typeof data.url === 'string' ? data.url : '';
          const conversationId = typeof data.conversationId === 'string' ? data.conversationId : '';
          window.dispatchEvent(
            new CustomEvent('app:native-push-navigate', {
              detail: { url, conversationId },
            }),
          );
        });
        removeListeners.push(() => {
          void actionListener.remove();
        });

        await registerForPush();
      } catch (e) {
        console.warn('[fcm] setup/register failed', e);
      }
    })();

    const onPermissionsGranted = (): void => {
      void registerForPush();
    };
    window.addEventListener('app:native-push-permissions-granted', onPermissionsGranted);

    return () => {
      cancelled = true;
      window.removeEventListener('app:native-push-permissions-granted', onPermissionsGranted);
      for (const remove of removeListeners) {
        remove();
      }
    };
  }, [token]);
}
