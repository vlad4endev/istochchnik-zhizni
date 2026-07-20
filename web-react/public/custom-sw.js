/**
 * Старые runtime-кэши с фиксированными именами (до суффикса по коммиту в vite.config).
 * После активации нового SW удаляем, чтобы не копить мусор и не путать отладку.
 */
var LEGACY_RUNTIME_CACHE_NAMES = [
  'static-cache',
  'images-cache',
  'fonts-cache',
  'api-cache',
  'google-fonts',
];
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (name) {
            return LEGACY_RUNTIME_CACHE_NAMES.indexOf(name) !== -1;
          })
          .map(function (name) {
            return caches.delete(name);
          }),
      );
    }),
  );
});

self.addEventListener('push', function (event) {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Уведомление';

  // Helper to parse potential stringified JSON from FCM backend
  const parseJsonStr = (val, fallback) => {
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return fallback; }
    }
    return val !== undefined ? val : fallback;
  };

  // Extract new properties or fallback to defaults
  const options = {
    body: data.body || '',
    /** PNG: Android уведомления часто не рисуют SVG для icon/badge. */
    icon: data.icon || '/assets/pwa-192x192.png',
    badge: data.badge || '/assets/pwa-192x192.png',
    tag: data.tag || undefined,
    renotify: parseJsonStr(data.renotify, false),
    actions:
      data.type === 'media_assignment'
        ? [
            { action: 'confirm', title: '✓ Подтвердить' },
            { action: 'decline', title: '✗ Отказать' },
          ]
        : parseJsonStr(data.actions, []),
    data: {
      url: data.url || '/',
      conversationId: data.conversationId != null ? data.conversationId : null,
      deliveryId: data.deliveryId != null && data.deliveryId !== '' ? String(data.deliveryId) : null,
      assignmentId: data.assignmentId != null && data.assignmentId !== '' ? String(data.assignmentId) : null,
      pushType: data.type || null,
    },
    vibrate: [200, 100, 200],
  };

  const rawBadge = data.badgeCount;
  const parsedBadge =
    typeof rawBadge === 'number'
      ? rawBadge
      : typeof rawBadge === 'string'
        ? parseInt(rawBadge, 10)
        : NaN;
  const appBadge = Number.isFinite(parsedBadge) ? Math.min(99, Math.max(0, parsedBadge)) : 0;

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      try {
        if (
          self.navigator &&
          'setAppBadge' in self.navigator &&
          typeof self.navigator.setAppBadge === 'function'
        ) {
          if (appBadge > 0) {
            await self.navigator.setAppBadge(appBadge);
          } else if (typeof self.navigator.clearAppBadge === 'function') {
            await self.navigator.clearAppBadge();
          }
        }
      } catch {
        /* Badging API не везде доступен */
      }
    })(),
  );
});

/**
 * Навигацию не перехватываем здесь: иначе этот listener регистрируется раньше Workbox
 * и `respondWith` блокирует precache + navigateFallback (офлайн остаётся SPA из кэша).
 * `offline.html` по-прежнему в precache — при необходимости на неё можно вести из приложения.
 */

function markDeliveryOpenedById(deliveryIdRaw) {
  const deliveryId =
    typeof deliveryIdRaw === 'string'
      ? deliveryIdRaw.trim()
      : deliveryIdRaw != null
        ? String(deliveryIdRaw).trim()
        : '';
  if (!(deliveryId && /^\d+$/.test(deliveryId))) {
    return Promise.resolve();
  }
  return fetch(new URL('/api/notifications/deliveries/' + deliveryId + '/open', self.location.origin).href, {
    method: 'POST',
    credentials: 'include',
    mode: 'same-origin',
  }).catch(function () {});
}

function markDeliveryDismissedById(deliveryIdRaw) {
  const deliveryId =
    typeof deliveryIdRaw === 'string'
      ? deliveryIdRaw.trim()
      : deliveryIdRaw != null
        ? String(deliveryIdRaw).trim()
        : '';
  if (!(deliveryId && /^\d+$/.test(deliveryId))) {
    return Promise.resolve();
  }
  return fetch(new URL('/api/notifications/deliveries/' + deliveryId + '/dismiss', self.location.origin).href, {
    method: 'POST',
    credentials: 'include',
    mode: 'same-origin',
  }).catch(function () {});
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const markDeliveryOpened = markDeliveryOpenedById(event.notification?.data?.deliveryId);
  const markDeliveryDismissed = markDeliveryDismissedById(event.notification?.data?.deliveryId);

  // Explicit dismiss action: закрыли без открытия приложения.
  if (event.action === 'dismiss') {
    event.waitUntil(markDeliveryDismissed);
    return;
  }

  if (event.action === 'confirm' || event.action === 'decline') {
    const assignmentId = event.notification?.data?.assignmentId;
    const status = event.action === 'confirm' ? 'confirmed' : 'declined';
    if (assignmentId) {
      event.waitUntil(
        fetch(new URL('/api/media-schedule/assignments/' + assignmentId + '/status', self.location.origin).href, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
          credentials: 'include',
          mode: 'same-origin',
        }).catch(function () {}),
      );
      return;
    }
  }

  const safeUrl = event.notification?.data?.url || '/';
  const urlToOpen = new URL(safeUrl, self.location.origin).href;

  event.waitUntil(
    markDeliveryOpened.then(function () {
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        let clientToFocus = null;
        for (const client of windowClients) {
          if (client.url && new URL(client.url).origin === self.location.origin) {
            clientToFocus = client;
            break;
          }
        }

        if (clientToFocus) {
          clientToFocus.focus();
          try {
            clientToFocus.postMessage({
              type: 'push:navigate',
              url: urlToOpen,
              conversationId: event.notification.data.conversationId || null,
            });
          } catch {
            /* ignore */
          }
          return;
        }
        return clients.openWindow(urlToOpen);
      });
    }),
  );
});

self.addEventListener('notificationclose', function (event) {
  event.waitUntil(markDeliveryDismissedById(event.notification?.data?.deliveryId));
});

// Handle browser rotating VAPID/subscription keys silently
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    (async function () {
      const old = event.oldSubscription;
      if (!old || typeof old.options !== 'object') return;
      try {
        const newSubscription = await self.registration.pushManager.subscribe(old.options);
        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscription),
          credentials: 'include',
          mode: 'same-origin',
        });
        if (!res.ok) {
          console.warn('[sw] pushsubscriptionchange: subscribe failed', res.status);
        }
      } catch (e) {
        console.warn('[sw] pushsubscriptionchange failed', e);
      }
    })(),
  );
});
