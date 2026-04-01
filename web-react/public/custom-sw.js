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
  const options = {
    body: data.body || '',
    icon: '/assets/logo_minimal.svg',
    badge: '/assets/logo_minimal.svg',
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

  const safeUrl = event.notification?.data?.url || '/';
  const urlToOpen = new URL(safeUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Prefer focusing any existing app window/tab.
      const client = windowClients && windowClients.length ? windowClients[0] : null;
      if (client) {
        client.focus();
        // If app is already open, let it navigate to the chat (best-effort).
        try {
          client.postMessage({ type: 'push:navigate', url: urlToOpen, conversationId: event.notification.data.conversationId || null });
        } catch {
          /* ignore */
        }
        return;
      }
      return clients.openWindow(urlToOpen);
    })
  );
});
