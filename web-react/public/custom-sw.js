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

  // Extract new properties or fallback to defaults
  const options = {
    body: data.body || '',
    icon: data.icon || '/assets/logo_minimal.svg',
    badge: data.badge || '/assets/logo_minimal.svg',
    tag: data.tag || undefined,
    renotify: data.renotify ?? false,
    actions: data.actions || [],
    data: {
      url: data.url || '/',
      conversationId: data.conversationId || null,
    },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  // Handle explicit 'dismiss' action
  if (event.action === 'dismiss') {
    return;
  }

  const safeUrl = event.notification?.data?.url || '/';
  const urlToOpen = new URL(safeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Prefer focusing any existing app window/tab that matches origin
      let clientToFocus = null;
      for (const client of windowClients) {
        if (client.url && new URL(client.url).origin === self.location.origin) {
          clientToFocus = client;
          break;
        }
      }

      if (clientToFocus) {
        clientToFocus.focus();
        // If app is already open, let it navigate to the chat (best-effort).
        try {
          clientToFocus.postMessage({ type: 'push:navigate', url: urlToOpen, conversationId: event.notification.data.conversationId || null });
        } catch {
          /* ignore */
        }
        return;
      }
      return clients.openWindow(urlToOpen);
    })
  );
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
