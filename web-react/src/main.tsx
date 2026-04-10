import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';

import { applyNativeShellViewportLock } from './lib/nativeShellViewport';
import { AppRouter } from './app/Router';
import { AppRouterMain } from './app/RouterMain';
import { AppRouterStudio } from './app/RouterStudio';
import { getAppVariant } from './lib/appVariant';
import './index.css';

applyNativeShellViewportLock();
window.addEventListener('load', () => applyNativeShellViewportLock());

function RootRouter() {
  const v = getAppVariant();
  if (v === 'main') return <AppRouterMain />;
  if (v === 'studio') return <AppRouterStudio />;
  return <AppRouter />;
}

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

// PWA (iOS Safari) update hardening:
// iOS PWAs may keep serving stale cached assets unless we aggressively update + reload.
if (import.meta.env.PROD) {
  try {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        // Activate waiting SW and reload the app.
        void updateSW(true);
      },
      onRegisteredSW: (_swUrl, reg) => {
        if (!reg) return;
        // Periodically re-check updates (iOS sometimes delays update checks).
        window.setInterval(() => void reg.update(), 60_000);
        // Also re-check when returning to the app.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update();
        });
      },
    });

    navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
      // Ensure the new SW takes effect immediately.
      window.location.reload();
    });
  } catch {
    /* ignore */
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-x-clip">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <RootRouter />
        </BrowserRouter>
      </QueryClientProvider>
    </div>
  </StrictMode>,
);
