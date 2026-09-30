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

    // Подписка может тихо «протухнуть» (iOS вытесняет, сервер удалил по 410): при возврате в приложение
    // не чаще раза в 6 часов перепроверяем и пересоздаём её.
    let lastResyncMs = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastResyncMs < 6 * 3600_000) return;
      lastResyncMs = now;
      void initMessengerPushNotifications({ force: true });
    };
    document.addEventListener('visibilitychange', onVisible);

    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) {
      return () => document.removeEventListener('visibilitychange', onVisible);
    }

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
      document.removeEventListener('visibilitychange', onVisible);
      sw.removeEventListener('controllerchange', resyncAfterSwChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);
}
