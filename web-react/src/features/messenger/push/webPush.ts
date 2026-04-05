import { apiClient } from '../../../lib/apiClient';
import { fetchVapidPublicKey } from '../../profile/api';

/** Последний известный публичный VAPID с сервера — чтобы при смене ключей пересоздать подписку. */
const LS_VAPID_PUBLIC_KEY = 'web_push_vapid_public_key';

function subscriptionToJsonBody(sub: PushSubscription): Record<string, unknown> {
  if (typeof sub.toJSON === 'function') {
    return sub.toJSON() as Record<string, unknown>;
  }
  return {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime,
    keys: {
      p256dh: bufferToUrlBase64(sub.getKey('p256dh')),
      auth: bufferToUrlBase64(sub.getKey('auth')),
    },
  };
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
export async function initMessengerPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;

  // Не инициируем системный prompt сами — это должно быть пользовательское действие.
  if (Notification.permission !== 'granted') return;

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
    await apiClient.post('/api/notifications/subscribe', subscriptionToJsonBody(existing));
    localStorage.setItem(LS_VAPID_PUBLIC_KEY, vapidPublicKey);
    return;
  }

  const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedVapidKey,
  });

  localStorage.setItem(LS_VAPID_PUBLIC_KEY, vapidPublicKey);
  await apiClient.post('/api/notifications/subscribe', subscriptionToJsonBody(subscription));
}

