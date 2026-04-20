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
    icon: data.icon || '/assets/logo_minimal.svg',
    badge: data.badge || '/assets/logo_minimal.svg',
    tag: data.tag || undefined,
    renotify: parseJsonStr(data.renotify, false),
    actions: parseJsonStr(data.actions, []),
    data: {
      url: data.url || '/',
      conversationId: data.conversationId != null ? data.conversationId : null,
      deliveryId: data.deliveryId != null && data.deliveryId !== '' ? String(data.deliveryId) : null,
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

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const markDeliveryOpened = markDeliveryOpenedById(event.notification?.data?.deliveryId);

  // Handle explicit 'dismiss' action — всё равно снимаем запись с бейджа
  if (event.action === 'dismiss') {
    event.waitUntil(markDeliveryOpened);
    return;
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
  event.waitUntil(markDeliveryOpenedById(event.notification?.data?.deliveryId));
});

// Handle browser rotating VAPID/subscription keys silently
self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options)
      .then(function(newSubscription) {
        // Send new subscription to backend
        return fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Can't reliably read localStorage here for auth tokens,
            // so we rely on cookies/session if available, 
            // or the client app syncing it on the next load.
          },
          body: JSON.stringify(newSubscription)
        });
      })
  );
});
