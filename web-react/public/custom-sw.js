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
    // renotify без tag бросает TypeError в showNotification (Chrome) — тогда пуш не показывается.
    renotify: data.tag ? parseJsonStr(data.renotify, false) === true : false,
    actions:
      data.type === 'media_assignment'
        ? [
            { action: 'confirm', title: '✓ Подтвердить' },
            { action: 'decline', title: '✗ Отказать' },
          ]
        : parseJsonStr(data.actions, []),
    lang: 'ru',
    timestamp: Date.now(),
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

  const hasBadgeCount = rawBadge !== undefined && rawBadge !== null && rawBadge !== '';

  event.waitUntil(
    (async () => {
      // userVisibleOnly: на каждый push обязан быть показ уведомления (иначе iOS/Chrome
      // отзывают подписку). При ошибке опций показываем упрощённое уведомление.
      try {
        await self.registration.showNotification(title, options);
      } catch (e) {
        await self.registration.showNotification(title, {
          body: options.body,
          icon: options.icon,
          tag: options.tag,
          data: options.data,
        });
      }
      try {
        if (
          hasBadgeCount &&
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
  // Explicit dismiss action: закрыли без открытия приложения.
  if (event.action === 'dismiss') {
    event.waitUntil(markDeliveryDismissedById(event.notification?.data?.deliveryId));
    return;
  }

  // Раньше /dismiss вызывался на каждый клик вместе с /open — доставка помечалась и «закрытой».
  const markDeliveryOpened = markDeliveryOpenedById(event.notification?.data?.deliveryId);

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

  // Открываем только страницы нашего origin — url приходит из payload.
  let urlToOpen = self.location.origin + '/';
  try {
    const candidate = new URL(event.notification?.data?.url || '/', self.location.origin);
    if (candidate.origin === self.location.origin) urlToOpen = candidate.href;
  } catch (e) {
    /* оставляем корень */
  }

  event.waitUntil(
    markDeliveryOpened.then(function () {
      return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        // Предпочитаем окно, которое уже в фокусе/видно, иначе первое окно нашего origin.
        let clientToFocus = null;
        for (const client of windowClients) {
          if (!client.url || new URL(client.url).origin !== self.location.origin) continue;
          if (client.focused) {
            clientToFocus = client;
            break;
          }
          if (!clientToFocus || (client.visibilityState === 'visible' && clientToFocus.visibilityState !== 'visible')) {
            clientToFocus = client;
          }
        }

        if (clientToFocus) {
          try {
            const p = clientToFocus.focus();
            if (p && typeof p.catch === 'function') p.catch(function () {});
          } catch (e) {
            /* iOS иногда запрещает focus() */
          }
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

// Клиент просит очистить шторку (пользователь открыл приложение / прочитал чат).
self.addEventListener('message', function (event) {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'push:clear-all' || msg.type === 'push:clear-tag') {
    event.waitUntil(
      (async function () {
        try {
          const opts = msg.type === 'push:clear-tag' && msg.tag ? { tag: String(msg.tag) } : {};
          const list = await self.registration.getNotifications(opts);
          list.forEach(function (n) {
            n.close();
          });
          if (
            msg.type === 'push:clear-all' &&
            self.navigator &&
            typeof self.navigator.clearAppBadge === 'function'
          ) {
            await self.navigator.clearAppBadge();
          }
        } catch (e) {
          /* ignore */
        }
      })(),
    );
  }
});

self.addEventListener('notificationclose', function (event) {
  event.waitUntil(markDeliveryDismissedById(event.notification?.data?.deliveryId));
});

// Браузер ротировал подписку (истёк срок, смена ключей) — тихо пересоздаём и сохраняем.
self.addEventListener('pushsubscriptionchange', function (event) {
  event.waitUntil(
    (async function () {
      try {
        let newSubscription = event.newSubscription || null;
        if (!newSubscription) {
          let options = event.oldSubscription && event.oldSubscription.options;
          if (!options || !options.applicationServerKey) {
            // oldSubscription недоступен (Safari/iOS, Firefox) — берём ключ с сервера.
            const keyRes = await fetch('/api/notifications/vapid-public-key', {
              credentials: 'include',
              mode: 'same-origin',
            });
            if (!keyRes.ok) return;
            const { publicKey } = await keyRes.json();
            if (!publicKey) return;
            const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
            const raw = atob((publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'));
            const key = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
            options = { userVisibleOnly: true, applicationServerKey: key };
          }
          newSubscription = await self.registration.pushManager.subscribe(options);
        }
        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSubscription),
          credentials: 'include',
          mode: 'same-origin',
        });
        if (!res.ok) {
          // Не авторизованы в SW (401) — подписка досохранится при следующем открытии приложения.
          console.warn('[sw] pushsubscriptionchange: subscribe failed', res.status);
        }
      } catch (e) {
        console.warn('[sw] pushsubscriptionchange failed', e);
      }
    })(),
  );
});
