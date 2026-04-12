import { apiClient } from '../../../lib/apiClient';
import { emitAppToast } from '../../../lib/uiFeedback';
import { fetchVapidPublicKey } from '../../profile/api';

/** Последний известный публичный VAPID с сервера — чтобы при смене ключей пересоздать подписку. */
const LS_VAPID_PUBLIC_KEY = 'web_push_vapid_public_key';

function subscriptionToJsonBody(sub: PushSubscription): Record<string, unknown> {
  let body: Record<string, unknown>;
  if (typeof sub.toJSON === 'function') {
    body = sub.toJSON() as Record<string, unknown>;
  } else {
    body = {
      endpoint: sub.endpoint,
      expirationTime: sub.expirationTime,
      keys: {
        p256dh: bufferToUrlBase64(sub.getKey('p256dh')),
        auth: bufferToUrlBase64(sub.getKey('auth')),
      },
    };
  }
  
  if (typeof navigator !== 'undefined') {
    body.userAgent = navigator.userAgent;
  }
  return body;
}

function bufferToUrlBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Синхронизация Web Push с бэкендом (мессенджер, календарь и т.д.).
 * Вызывается из `useWebPushSync` в Layout после входа (веб/PWA, не Capacitor).
 *
 * - разрешение default/denied — выходим (запрос прав — через баннер NotificationPrompt или профиль);
 * - разрешение granted — создаём подписку при необходимости и POST /api/notifications/subscribe.
 */
function readPushSubscribeError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { status?: number; data?: { error?: string } } }).response;
    const msg = r?.data && typeof r.data.error === 'string' ? r.data.error : '';
    if (r?.status === 401) return 'Войдите снова, чтобы сохранить подписку на уведомления.';
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось сохранить подписку на сервере.';
}

export async function initMessengerPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;

  // Не инициируем системный prompt сами — это должно быть пользовательское действие.
  if (Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;

    const envKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
    let serverVapidKey = '';
    try {
      serverVapidKey = (await fetchVapidPublicKey()).trim();
    } catch {
      /* офлайн / CORS — fallback на ключ из сборки */
    }
    const vapidPublicKey =
      serverVapidKey || (envKey && envKey.trim() ? envKey.trim() : '');
    if (!vapidPublicKey) {
      console.warn('[push] VAPID public key is missing, skipping push subscribe.');
      return;
    }

    const storedKey = localStorage.getItem(LS_VAPID_PUBLIC_KEY);
    let existing = await registration.pushManager.getSubscription();

    if (existing && storedKey && storedKey !== vapidPublicKey) {
      try {
        await existing.unsubscribe();
      } catch {
        /* ignore */
      }
      existing = null;
      localStorage.removeItem(LS_VAPID_PUBLIC_KEY);
    }

    if (existing) {
      try {
        await apiClient.post('/api/notifications/subscribe', subscriptionToJsonBody(existing));
        localStorage.setItem(LS_VAPID_PUBLIC_KEY, vapidPublicKey);
      } catch (err) {
        console.error('[push] POST /subscribe (sync existing) failed:', err);
        emitAppToast(readPushSubscribeError(err), 'error');
      }
      return;
    }

    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey,
    });

    localStorage.setItem(LS_VAPID_PUBLIC_KEY, vapidPublicKey);
    try {
      await apiClient.post('/api/notifications/subscribe', subscriptionToJsonBody(subscription));
    } catch (err) {
      console.error('[push] POST /subscribe (new) failed:', err);
      emitAppToast(readPushSubscribeError(err), 'error');
      try {
        await subscription.unsubscribe();
      } catch {
        /* ignore */
      }
      localStorage.removeItem(LS_VAPID_PUBLIC_KEY);
    }
  } catch (err) {
    console.error('[push] initMessengerPushNotifications failed:', err);
    emitAppToast(
      'Не удалось включить push в браузере. Проверьте интернет и откройте сайт по HTTPS; на iPhone — ярлык с экрана «Домой».',
      'error',
    );
  }
}

