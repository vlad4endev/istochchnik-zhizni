import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';
import { initMessengerPushNotifications } from '../features/messenger/push/webPush';

/**
 * Синхронизирует Web Push подписку с бэкендом для всего приложения (не только экран «Чаты»).
 * Нативные устройства обрабатываются в useFCM (FCM токен).
 *
 * Важно: не форсим POST /subscribe на каждый visibilitychange — это дёргало 401-interceptor
 * и сбрасывало сессию при возврате во вкладку / PWA.
 */
export function useWebPushSync(): void {
  const token = useAuthStore((s) => s.token);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!token?.trim()) return;
    if (Capacitor.isNativePlatform()) return;
    if (typeof window === 'undefined') return;

    // Один раз после входа / смены токена.
    void initMessengerPushNotifications({ force: true });

    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) return;

    const resyncAfterSwChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = undefined;
        // Новый SW мог ротировать push subscription — нужно пересохранить endpoint.
        void initMessengerPushNotifications({ force: true });
      }, 800);
    };

    sw.addEventListener('controllerchange', resyncAfterSwChange);
    return () => {
      sw.removeEventListener('controllerchange', resyncAfterSwChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);
}
