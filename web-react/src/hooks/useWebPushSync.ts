import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

import { useAuthStore } from '../features/auth/authStore';
import { initMessengerPushNotifications } from '../features/messenger/push/webPush';
import { fetchPushStatus } from '../features/profile/api';

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

    // Один раз после входа / смены токена. Если SW не готов или временная ошибка (401/5xx/сеть
    // при передеплое) — повторяем с нарастающей паузой, а не ждём ручной перезагрузки.
    let cancelled = false;
    let lastSyncOk = false;
    const retryTimers: ReturnType<typeof setTimeout>[] = [];
    const scheduleRetry = (attempt: number) => {
      const delays = [10_000, 30_000, 90_000, 300_000];
      if (cancelled || attempt >= delays.length) return;
      retryTimers.push(setTimeout(() => void syncWithRetry(attempt + 1), delays[attempt]));
    };
    const syncWithRetry = async (attempt = 0): Promise<void> => {
      const result = await initMessengerPushNotifications({ force: true, silent: true });
      if (cancelled) return;
      if (result.ok) {
        lastSyncOk = true;
        return;
      }
      lastSyncOk = false;
      if (result.code === 'sw-not-ready' || result.retryable === true) {
        scheduleRetry(attempt);
      }
    };
    void syncWithRetry();

    // После передеплоя сервер мог потерять подписку (новые VAPID-ключи → 403/410 → удаление, пересоздание БД),
    // а браузер продолжает считать себя подписанным (или наоборот — iOS/браузер сбросил подписку при granted).
    let lastServerCheckMs = 0;
    const verifyWithServer = async () => {
      const now = Date.now();
      if (now - lastServerCheckMs < 5 * 60_000) return;
      lastServerCheckMs = now;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = await reg?.pushManager?.getSubscription();
        if (!sub) {
          await syncWithRetry();
          return;
        }
        const status = await fetchPushStatus(sub.endpoint);
        if (status.currentEndpointRegistered === false) {
          await syncWithRetry();
        }
      } catch {
        /* сеть/401 — повторим при следующем возврате в приложение */
      }
    };
    void verifyWithServer();

    // Подписка может тихо «протухнуть» (iOS вытесняет, сервер удалил по 410): при возврате в приложение
    // не чаще раза в 6 часов перепроверяем и пересоздаём её.
    let lastResyncMs = Date.now();
    let lastLocalCheckMs = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!lastSyncOk || now - lastResyncMs >= 6 * 3600_000) {
        lastResyncMs = now;
        void syncWithRetry();
        return;
      }
      // Дёшево (локально, без сети): разрешение выдали в системных настройках или iOS вытеснил подписку —
      // не ждём 6 часов, а восстанавливаем сразу при возврате в приложение.
      void verifyWithServer();
      if (now - lastLocalCheckMs < 30_000) return;
      lastLocalCheckMs = now;
      void (async () => {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          if (!sub) {
            lastResyncMs = Date.now();
            await syncWithRetry();
          }
        } catch {
          /* следующая проверка при очередном возврате */
        }
      })();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Возврат в сеть после офлайна: если синхронизация ранее не прошла, повторяем немедленно.
    const onOnline = () => {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      if (!lastSyncOk) {
        void syncWithRetry();
      } else {
        lastServerCheckMs = 0;
        void verifyWithServer();
      }
    };
    window.addEventListener('online', onOnline);

    // Пользователь включил уведомления в настройках браузера, не покидая вкладку.
    let permStatus: PermissionStatus | null = null;
    const onPermChange = () => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        void syncWithRetry();
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
      cancelled = true;
      retryTimers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
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
        void syncWithRetry();
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
