import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';
import {
  initMessengerPushNotifications,
  resetWebPushSyncCache,
} from '../features/messenger/push/webPush';

/**
 * Синхронизирует Web Push подписку с бэкендом для всего приложения (не только экран «Чаты»).
 * Нативные устройства обрабатываются в useFCM (FCM токен).
 */
export function useWebPushSync(): void {
  const token = useAuthStore((s) => s.token);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!token?.trim()) return;
    if (Capacitor.isNativePlatform()) return;
    if (typeof window === 'undefined') return;

    void initMessengerPushNotifications({ force: true });

    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) return;

    const resync = (force = false) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        if (force) resetWebPushSyncCache();
        void initMessengerPushNotifications({ force });
      }, 800);
    };

    const onControllerChange = () => resync(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') resync(true);
    };

    sw.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);
}
