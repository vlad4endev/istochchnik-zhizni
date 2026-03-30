import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { AppRouter } from './app/Router';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /** Несколько пользователей и вкладок: подтягиваем свежие данные при возврате на вкладку. */
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      staleTime: 30_000,
    },
  },
});

// Инициализация автоматического обновления Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] Service Worker обновлён, перезагружаем приложение');
    // Перезагружаем страницу при обновлении Service Worker
    window.location.reload();
  });

  // Проверяем обновления каждые 60 секунд
  setInterval(async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
      }
    } catch (error) {
      console.error('[PWA] Ошибка при проверке обновлений:', error);
    }
  }, 60000);

  // Первоначальная проверка сразу
  navigator.serviceWorker.ready.then(async (registration) => {
    await registration.update();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
