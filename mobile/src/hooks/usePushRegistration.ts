import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { saveFcmToken } from '../api/notifications';
import { getOrCreateDeviceId } from '../lib/storage';
import { useAuthStore } from '../stores/authStore';

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

async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  // Native FCM device token when available (EAS + google-services); else Expo push token.
  try {
    const devicePush = await Notifications.getDevicePushTokenAsync();
    if (devicePush?.data && typeof devicePush.data === 'string') {
      return devicePush.data;
    }
  } catch {
    // Fall through to Expo token (works in Expo Go / without FCM config).
  }

  try {
    const expoPush = await Notifications.getExpoPushTokenAsync();
    return expoPush.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Registers device for push and saves token to `/api/notifications/save-token`.
 * Requires a physical device; on Android production builds needs `google-services.json`.
 */
export function usePushRegistration() {
  const token = useAuthStore((s) => s.token);
  const lastSaved = useRef<string | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const run = async () => {
      try {
        const pushToken = await registerForPush();
        if (!pushToken || cancelled) return;
        if (lastSaved.current === pushToken) return;
        await saveFcmToken({
          fcm_token: pushToken,
          device_id: getOrCreateDeviceId(),
        });
        lastSaved.current = pushToken;
      } catch (err) {
        console.warn('[push] registration failed', err);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [token]);
}
