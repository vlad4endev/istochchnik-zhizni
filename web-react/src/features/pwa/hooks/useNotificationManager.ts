import { useState, useEffect, useCallback } from 'react';
import { fetchVapidPublicKey, subscribeToPushApi, unsubscribeFromPushApi } from '../../profile/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function useNotificationManager() {
  const [status, setStatus] = useState<NotificationStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      setLoading(false);
      return;
    }

    setStatus(Notification.permission as NotificationStatus);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(subscription !== null);
    } catch (e) {
      console.error('Error checking push subscription:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  /** После фоновой синхронизации из useWebPushSync обновляем «подписан ли браузер». */
  useEffect(() => {
    const onFocus = () => void checkStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkStatus]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as NotificationStatus);

      if (permission !== 'granted') {
        throw new Error('Разрешение на уведомления не предоставлено');
      }

      const vapidPublicKey = await fetchVapidPublicKey();
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      await subscribeToPushApi(subscription);
      setIsSubscribed(true);
      return true;
    } catch (err: any) {
      console.error('Push Subscription Error:', err);
      setError(err.message || 'Ошибка при подписке на уведомления');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Send request to backend to delete from DB
        try {
          await unsubscribeFromPushApi(subscription.endpoint);
        } catch (e) {
          console.error('Failed to report unsubscribe to backend', e);
        }
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      
      // Clear app badge when unsubscribing
      if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
         try {
           // eslint-disable-next-line @typescript-eslint/ban-ts-comment
           // @ts-ignore
           await navigator.clearAppBadge();
         } catch {
           /* ignore */
         }
      }
      
      return true;
    } catch (err: any) {
      console.error('Push Unsubscription Error:', err);
      setError(err.message || 'Ошибка при отписке от уведомлений');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    status,
    isSubscribed,
    loading,
    error,
    subscribe,
    unsubscribe,
    checkStatus
  };
}
