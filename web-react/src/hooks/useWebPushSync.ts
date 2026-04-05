import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';
import { initMessengerPushNotifications } from '../features/messenger/push/webPush';

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

    void initMessengerPushNotifications();

    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) return;

    const resync = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        void initMessengerPushNotifications();
      }, 800);
    };

    sw.addEventListener('controllerchange', resync);
    return () => {
      sw.removeEventListener('controllerchange', resync);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);
}
