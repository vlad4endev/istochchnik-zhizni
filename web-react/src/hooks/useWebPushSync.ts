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
    let lastLocalCheckMs = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastResyncMs >= 6 * 3600_000) {
        lastResyncMs = now;
        void initMessengerPushNotifications({ force: true });
        return;
      }
      // Дёшево (локально, без сети): разрешение выдали в системных настройках или iOS вытеснил подписку —
      // не ждём 6 часов, а восстанавливаем сразу при возврате в приложение.
      if (now - lastLocalCheckMs < 30_000) return;
      lastLocalCheckMs = now;
      void (async () => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          if (!sub) {
            lastResyncMs = Date.now();
            await initMessengerPushNotifications({ force: true });
          }
        } catch {
          /* следующая проверка при очередном возврате */
        }
      })();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Пользователь включил уведомления в настройках браузера, не покидая вкладку.
    let permStatus: PermissionStatus | null = null;
    const onPermChange = () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        void initMessengerPushNotifications({ force: true });
      }
    };
    try {
      void navigator.permissions
        ?.query({ name: 'notifications' as PermissionName })
        .then((st) => {
          permStatus = st;
          st.addEventListener('change', onPermChange);
        })
        .catch(() => undefined);
    } catch {
      /* Permissions API недоступен */
    }

    const removeBase = () => {
      document.removeEventListener('visibilitychange', onVisible);
      permStatus?.removeEventListener('change', onPermChange);
    };
    const sw = navigator.serviceWorker;
    if (!sw?.addEventListener) {
      return removeBase;
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
      removeBase();
      sw.removeEventListener('controllerchange', resyncAfterSwChange);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [token]);
}
