import { apiClient } from '../../../lib/apiClient';
import { emitAppToast } from '../../../lib/uiFeedback';
import { fetchVapidPublicKey } from '../../profile/api';
import { ensureServiceWorkerRegistered } from '../../pwa/ensureServiceWorker';

/** Последний известный публичный VAPID с сервера — чтобы при смене ключей пересоздать подписку. */
const LS_VAPID_PUBLIC_KEY = 'web_push_vapid_public_key';
export type WebPushResult = { ok: boolean; error?: string; code?: 'sw-not-ready' };
let pushSyncInFlight: Promise<WebPushResult> | null = null;
/** Endpoint, успешно сохранённый на сервере в этой вкладке. */
let lastSyncedEndpoint: string | null = null;

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

  // Ensure keys exist even when toJSON() omitted them (rare browser quirks).
  const keys = (body.keys && typeof body.keys === 'object' ? body.keys : {}) as Record<
    string,
    unknown
  >;
  if (typeof keys.p256dh !== 'string' || !keys.p256dh) {
    keys.p256dh = bufferToUrlBase64(sub.getKey('p256dh'));
  }
  if (typeof keys.auth !== 'string' || !keys.auth) {
    keys.auth = bufferToUrlBase64(sub.getKey('auth'));
  }
  body.keys = keys;
  body.endpoint = typeof body.endpoint === 'string' ? body.endpoint : sub.endpoint;

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
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/**
 * Синхронизация Web Push с бэкендом (мессенджер, календарь и т.д.).
 * Вызывается из `useWebPushSync` в Layout после входа (веб/PWA, не Capacitor).
 *
 * - разрешение default/denied — выходим (запрос прав — через баннер, модалку и виджет на главной);
 * - разрешение granted — создаём подписку при необходимости и POST /api/notifications/subscribe.
 */
function readPushSubscribeError(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const r = (err as { response?: { status?: number; data?: { error?: string } } }).response;
    const msg = r?.data && typeof r.data.error === 'string' ? r.data.error : '';
    if (r?.status === 401) return 'Войдите снова, чтобы сохранить подписку на уведомления.';
    if (r?.status === 503) return 'Сервер push не настроен (VAPID). Обратитесь к администратору.';
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Не удалось сохранить подписку на сервере.';
}

/**
 * Понятная причина, почему не удалось включить push, — по типу исключения браузера.
 * Общий текст «проверьте интернет» скрывал реальные случаи: SW не поднялся, push-сервис браузера
 * недоступен (AbortError) или VAPID-ключ на сервере повреждён.
 */
export function describePushEnableError(err: unknown): string {
  const name = err instanceof Error || (err && typeof err === 'object' && 'name' in err)
    ? String((err as { name?: unknown }).name ?? '')
    : '';
  const text = err instanceof Error ? err.message : '';
  if (/service worker not ready/i.test(text)) {
    return 'Service worker ещё не запущен. Обновите страницу (Ctrl+Shift+R) и попробуйте снова; в режиме разработки push не работает.';
  }
  if (name === 'AbortError') {
    return 'Браузер не смог связаться со своим push-сервисом (Google FCM / Apple). Проверьте доступ в интернет, отключите блокировщики и VPN; в Brave включите «Использовать сервисы Google для push-сообщений».';
  }
  if (name === 'NotAllowedError') {
    return 'Браузер не разрешил уведомления для этого сайта. Проверьте настройки сайта (значок замка в адресной строке).';
  }
  if (name === 'InvalidCharacterError' || name === 'InvalidAccessError') {
    return 'Ключ push-сервера (VAPID) на сервере повреждён. Обратитесь к администратору.';
  }
  if (name === 'InvalidStateError') {
    return 'Старая push-подписка конфликтует с новой. Обновите страницу и повторите.';
  }
  if (name === 'NotSupportedError' || name === 'SecurityError') {
    return 'Push работает только по HTTPS, а на iPhone — из ярлыка на экране «Домой».';
  }
  return `Не удалось включить push в браузере${name ? ` (${name})` : ''}. Проверьте интернет и откройте сайт по HTTPS; на iPhone — ярлык с экрана «Домой».`;
}

export async function initMessengerPushNotifications(opts?: { force?: boolean }): Promise<WebPushResult> {
  if (pushSyncInFlight) {
    return pushSyncInFlight;
  }
  pushSyncInFlight = initMessengerPushNotificationsInternal(opts?.force === true);
  try {
    return await pushSyncInFlight;
  } finally {
    pushSyncInFlight = null;
  }
}

/**
 * Явное включение push пользователем (жест клика): при необходимости запрашивает разрешение,
 * создаёт подписку (с учётом смены VAPID-ключа) и сохраняет её на сервере.
 */
export async function enableWebPush(): Promise<WebPushResult> {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, error: 'Браузер не поддерживает push-уведомления.' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, error: 'Уведомления заблокированы в настройках браузера.' };
  }
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, error: 'Разрешение на уведомления не предоставлено.' };
    }
  }
  if (pushSyncInFlight) await pushSyncInFlight.catch(() => undefined);
  pushSyncInFlight = initMessengerPushNotificationsInternal(true);
  try {
    return await pushSyncInFlight;
  } finally {
    pushSyncInFlight = null;
  }
}

/** Сравнение applicationServerKey существующей подписки с текущим VAPID-ключом сервера. */
function sameApplicationServerKey(sub: PushSubscription, vapid: Uint8Array): boolean {
  const raw = sub.options?.applicationServerKey;
  if (!raw) return true; // не можем проверить — доверяем сохранённому ключу
  const a = new Uint8Array(raw);
  if (a.length !== vapid.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== vapid[i]) return false;
  return true;
}

/** Сбросить кэш успешной синхронизации (после ошибки / возврата во вкладку). */
export function resetWebPushSyncCache(): void {
  lastSyncedEndpoint = null;
}

async function syncSubscriptionWithServer(
  subscription: PushSubscription,
  vapidPublicKey: string,
  force: boolean,
): Promise<void> {
  const endpoint = subscription.endpoint;
  if (!force && lastSyncedEndpoint === endpoint) return;
  await apiClient.post('/api/notifications/subscribe', subscriptionToJsonBody(subscription), {
    // Не сбрасывать сессию и не показывать глобальный «войдите снова» из 401-interceptor.
    skipAuthClearOn401: true,
    silentErrorToast: true,
  });
  localStorage.setItem(LS_VAPID_PUBLIC_KEY, vapidPublicKey);
  lastSyncedEndpoint = endpoint;
}

async function initMessengerPushNotificationsInternal(force: boolean): Promise<WebPushResult> {
  if (!('serviceWorker' in navigator)) return { ok: false, error: 'Service Worker не поддерживается.' };
  if (!('PushManager' in window)) return { ok: false, error: 'Push не поддерживается браузером.' };

  // Не инициируем системный prompt сами — это должно быть пользовательское действие.
  if (Notification.permission !== 'granted') return { ok: false, error: 'Нет разрешения на уведомления.' };

  try {
    // Нет регистрации (sw.js отдал 5xx при передеплое) — пробуем зарегистрировать сами, иначе ready не наступит.
    await ensureServiceWorkerRegistered();
    // ready никогда не резолвится, если SW не зарегистрирован (dev/блокировка) — не вешаем синк навсегда.
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Service worker not ready')), 15_000),
      ),
    ]);

    const envKey = (import.meta as { env?: { VITE_VAPID_PUBLIC_KEY?: string } }).env
      ?.VITE_VAPID_PUBLIC_KEY;
    let serverVapidKey = '';
    try {
      serverVapidKey = (await fetchVapidPublicKey()).trim();
    } catch {
      /* офлайн / CORS — fallback на ключ из сборки */
    }
    const vapidPublicKey = serverVapidKey || (envKey && envKey.trim() ? envKey.trim() : '');
    if (!vapidPublicKey) {
      console.warn('[push] VAPID public key is missing, skipping push subscribe.');
      return { ok: false, error: 'Сервер push не настроен (VAPID). Обратитесь к администратору.' };
    }
    const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    const storedKey = localStorage.getItem(LS_VAPID_PUBLIC_KEY);
    let existing = await registration.pushManager.getSubscription();

    // Подписка, созданная под другим VAPID-ключом, не получит ни одного пуша (и subscribe() с новым
    // ключом бросит InvalidStateError) — пересоздаём.
    if (
      existing &&
      ((storedKey && storedKey !== vapidPublicKey) || !sameApplicationServerKey(existing, convertedVapidKey))
    ) {
      try {
        await existing.unsubscribe();
      } catch {
        /* ignore */
      }
      existing = null;
      localStorage.removeItem(LS_VAPID_PUBLIC_KEY);
      lastSyncedEndpoint = null;
    }

    if (existing) {
      try {
        await syncSubscriptionWithServer(existing, vapidPublicKey, force);
        return { ok: true };
      } catch (err) {
        console.error('[push] POST /subscribe (sync existing) failed:', err);
        lastSyncedEndpoint = null;
        // 401 здесь не значит «выйти» — сессию не трогаем; пользователю не мешаем.
        const status =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        const message = readPushSubscribeError(err);
        if (status !== 401) {
          emitAppToast({ message, kind: 'error' });
        }
        return { ok: false, error: message };
      }
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey,
    });

    try {
      await syncSubscriptionWithServer(subscription, vapidPublicKey, true);
      return { ok: true };
    } catch (err) {
      console.error('[push] POST /subscribe (new) failed:', err);
      const message = readPushSubscribeError(err);
      emitAppToast({ message, kind: 'error' });
      try {
        await subscription.unsubscribe();
      } catch {
        /* ignore */
      }
      localStorage.removeItem(LS_VAPID_PUBLIC_KEY);
      lastSyncedEndpoint = null;
      return { ok: false, error: message };
    }
  } catch (err) {
    console.error('[push] initMessengerPushNotifications failed:', err);
    lastSyncedEndpoint = null;
    if (err instanceof Error && err.message === 'Service worker not ready') {
      // Фоновый сбой (обычно идёт передеплой): без всплывающей ошибки, вызывающий повторит позже.
      return {
        ok: false,
        code: 'sw-not-ready',
        error: 'Service Worker ещё не готов, повторим автоматически.',
      };
    }
    const message = describePushEnableError(err);
    emitAppToast({ message, kind: 'error' });
    return { ok: false, error: message };
  }
}
