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
    icon: '/assets/pwa-192x192.png',
    badge: '/assets/pwa-64x64.png',
    data: data.url ? { url: data.url } : { url: '/' },
    vibrate: [200, 100, 200, 100, 200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      let matchingClient = null;

      for (let i = 0; i < windowClients.length; i++) {
        const windowClient = windowClients[i];
        if (windowClient.url === urlToOpen) {
          matchingClient = windowClient;
          break;
        }
      }

      if (matchingClient) {
        return matchingClient.focus();
      } else {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
