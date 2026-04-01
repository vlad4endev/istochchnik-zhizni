import { apiClient } from '../../../lib/apiClient';
import { fetchVapidPublicKey } from '../../profile/api';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Инициализация Web Push для мессенджера.
 *
 * Поведение по умолчанию безопасное:
 * - если разрешение не выдано (default/denied) — ничего не ломаем, просто выходим;
 * - если разрешение уже granted — гарантируем, что подписка создана и отправлена на бэкенд.
 */
export async function initMessengerPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  if (!('PushManager' in window)) return;

  // Не инициируем системный prompt сами — это должно быть пользовательское действие.
  if (Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    // На всякий случай синхронизируем с бэкендом (endpoint может переехать).
    await apiClient.post('/api/notifications/subscribe', existing);
    return;
  }

  const envKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
  const vapidPublicKey = (envKey && envKey.trim()) ? envKey.trim() : await fetchVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn('[push] VAPID public key is missing, skipping push subscribe.');
    return;
  }
  const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: convertedVapidKey,
  });

  await apiClient.post('/api/notifications/subscribe', subscription);
}

