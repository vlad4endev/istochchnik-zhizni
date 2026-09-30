import { useState, useEffect, useCallback } from 'react';
import { unsubscribeFromPushApi } from '../../profile/api';
import { enableWebPush } from '../../messenger/push/webPush';

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

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const result = await enableWebPush();
      setStatus(Notification.permission as NotificationStatus);
      if (result.ok) {
        setIsSubscribed(true);
        return { ok: true };
      }
      setError(result.error ?? 'Ошибка при подписке на уведомления');
      return result;
    } catch (err: unknown) {
      console.error('Push Subscription Error:', err);
      const message = err instanceof Error && err.message ? err.message : 'Ошибка при подписке на уведомления';
      setError(message);
      return { ok: false, error: message };
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
