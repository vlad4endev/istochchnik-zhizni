/**
 * Нативные модули пушей подключаются лениво и с защитой: в Expo Go или в сборке без Firebase
 * их нет, и приложение должно спокойно работать дальше, а не падать при запуске.
 */
import type { RemoteMessage } from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

export type NotificationsModule = typeof import('expo-notifications');

/** Минимум функций Firebase Messaging, которые нужны приложению. */
export type PushTransport = {
  getToken: () => Promise<string>;
  onTokenRefresh: (listener: (token: string) => void) => () => void;
  setBackgroundMessageHandler: (handler: (message: RemoteMessage) => Promise<void>) => void;
  registerForRemoteMessages: () => Promise<void>;
};

let transportCache: PushTransport | null | undefined;
let notificationsCache: NotificationsModule | null | undefined;

/** Транспорт пушей Firebase или null, если в этой сборке Firebase нет. */
export function getPushTransport(): PushTransport | null {
  if (transportCache !== undefined) return transportCache;
  if (Platform.OS === 'web') {
    transportCache = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fm = require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
    const messaging = fm.getMessaging();
    transportCache = {
      getToken: () => fm.getToken(messaging),
      onTokenRefresh: (listener) => fm.onTokenRefresh(messaging, listener),
      setBackgroundMessageHandler: (handler) => fm.setBackgroundMessageHandler(messaging, handler),
      registerForRemoteMessages: () => fm.registerDeviceForRemoteMessages(messaging),
    };
  } catch {
    transportCache = null;
  }
  return transportCache;
}

export function getNotifications(): NotificationsModule | null {
  if (notificationsCache !== undefined) return notificationsCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsCache = require('expo-notifications') as NotificationsModule;
  } catch {
    notificationsCache = null;
  }
  return notificationsCache;
}
