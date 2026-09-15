import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { saveFcmToken } from '../api/notifications';
import { getOrCreateDeviceId } from '../lib/storage';
import { navigateRoot } from '../navigation/navigationRef';
import { useAuthStore } from '../stores/authStore';
import {
  type PushRegistrationStatus,
  usePushStatusStore,
} from '../stores/pushStatusStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Сообщения',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
  await Notifications.setNotificationChannelAsync('general', {
    name: 'Уведомления',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function registerForPush(): Promise<
  { ok: true; token: string } | { ok: false; reason: PushRegistrationStatus }
> {
  if (!Device.isDevice) return { ok: false, reason: 'unsupported' };

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const devicePush = await Notifications.getDevicePushTokenAsync();
    if (devicePush?.data && typeof devicePush.data === 'string') {
      return { ok: true, token: devicePush.data };
    }
  } catch {
    // Fall through to Expo token.
  }

  try {
    const expoPush = await Notifications.getExpoPushTokenAsync();
    if (expoPush.data) return { ok: true, token: expoPush.data };
  } catch {
    return { ok: false, reason: 'error' };
  }

  return { ok: false, reason: 'error' };
}

function handleNotificationData(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const conversationId =
    (typeof data.conversationId === 'string' && data.conversationId) ||
    (typeof data.conversation_id === 'string' && data.conversation_id) ||
    null;
  if (conversationId) {
    navigateRoot('ChatThread', { conversationId, title: 'Чат' });
    return;
  }
  const type = typeof data.type === 'string' ? data.type : '';
  if (type === 'feed' || type === 'post') {
    navigateRoot('Feed');
  }
}

/**
 * Registers device for push and saves token to `/api/notifications/save-token`.
 * Call once from App root. Status is exposed via `usePushStatusStore`.
 */
export function usePushRegistration() {
  const token = useAuthStore((s) => s.token);
  const setStatus = usePushStatusStore((s) => s.setStatus);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('idle');
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const result = await registerForPush();
        if (cancelled) return;
        if (!result.ok) {
          setStatus(result.reason);
          return;
        }
        if (lastSaved.current === result.token) {
          setStatus('registered');
          return;
        }
        await saveFcmToken({
          fcm_token: result.token,
          device_id: getOrCreateDeviceId(),
        });
        lastSaved.current = result.token;
        setStatus('registered');
      } catch (err) {
        console.warn('[push] registration failed', err);
        if (!cancelled) setStatus('error');
      }
    };

    void run();

    const sub = Notifications.addPushTokenListener((pushToken) => {
      const value = typeof pushToken.data === 'string' ? pushToken.data : null;
      if (!value || value === lastSaved.current) return;
      void saveFcmToken({
        fcm_token: value,
        device_id: getOrCreateDeviceId(),
      })
        .then(() => {
          lastSaved.current = value;
          setStatus('registered');
        })
        .catch((err) => console.warn('[push] token refresh save failed', err));
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      handleNotificationData(data);
    });

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void run();
    });

    return () => {
      cancelled = true;
      sub.remove();
      responseSub.remove();
      appStateSub.remove();
    };
  }, [token, setStatus]);
}
