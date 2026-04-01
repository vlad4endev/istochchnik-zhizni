import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchVapidPublicKey, subscribeToPushApi } from '../../profile/api';

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
  
  // Track if we've already tried to auto-subscribe in this session
  const autoTriedRef = useRef(false);

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

      await subscribeToPushApi(JSON.parse(JSON.stringify(subscription)));
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

  // Auto-subscribe if permission is already granted but not subscribed
  useEffect(() => {
    if (status === 'granted' && !isSubscribed && !loading && !autoTriedRef.current) {
      autoTriedRef.current = true;
      void subscribe();
    }
  }, [status, isSubscribed, loading, subscribe]);

  return {
    status,
    isSubscribed,
    loading,
    error,
    subscribe,
    checkStatus
  };
}
