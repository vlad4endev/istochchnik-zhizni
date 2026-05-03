import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';

import { applyNativeShellViewportLock } from './lib/nativeShellViewport';
import { initPwaStandaloneHtmlHint } from './features/pwa/utils/pwaEnvironment';
import { AppRouter } from './app/Router';
import { AppRouterMain } from './app/RouterMain';
import { AppRouterStudio } from './app/RouterStudio';
import { TopLoader } from './components/ui/TopLoader';
import { AccessibilityProvider } from './lib/accessibility/AccessibilityProvider';
import { getAppVariant } from './lib/appVariant';
import { usePwaStore, type BeforeInstallPromptEvent } from './stores/pwaStore';
import { initAppearance, useAppearanceStore } from './stores/useAppearanceStore';
import './index.css';
import './styles/mobile.css';

applyNativeShellViewportLock();
window.addEventListener('load', () => applyNativeShellViewportLock());
initPwaStandaloneHtmlHint();
initAppearance();

try {
  const osThemeMql = window.matchMedia('(prefers-color-scheme: dark)');
  const onOsThemeChange = () => {
    if (useAppearanceStore.getState().theme === 'system') {
      useAppearanceStore.getState().setTheme('system');
    }
  };
  if (typeof osThemeMql.addEventListener === 'function') {
    osThemeMql.addEventListener('change', onOsThemeChange);
  } else {
    osThemeMql.addListener(onOsThemeChange);
  }
} catch {
  /* ignore */
}

function RootRouter() {
  const v = getAppVariant();
  if (v === 'main') return <AppRouterMain />;
  if (v === 'studio') return <AppRouterStudio />;
  return <AppRouter />;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      staleTime: 60_000,
      gcTime: 300_000,
    },
  },
});

// PWA (iOS Safari) update hardening:
// iOS PWAs may keep serving stale cached assets unless we aggressively update + reload.
if (import.meta.env.PROD) {
  try {
    let swUpdateErrorLogged = false;
    const safeUpdateRegistration = (reg: ServiceWorkerRegistration) => {
      void reg.update().catch((error) => {
        // Intermittent network/CDN hiccups should not create unhandled rejections.
        if (swUpdateErrorLogged) return;
        swUpdateErrorLogged = true;
        console.warn('Service Worker update check failed (will retry later):', error);
      });
    };

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        // Activate waiting SW and reload the app.
        void updateSW(true);
      },
      onRegisteredSW: (_swUrl, reg) => {
        if (!reg) return;
        // Periodically re-check updates (iOS sometimes delays update checks).
        window.setInterval(() => safeUpdateRegistration(reg), 60_000);
        // Also re-check when returning to the app.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') safeUpdateRegistration(reg);
        });
      },
    });

    navigator.serviceWorker?.addEventListener?.('controllerchange', () => {
      window.location.reload();
    });
  } catch {
    /* ignore */
  }
}

if (typeof window !== 'undefined') {
  const pwaStore = usePwaStore.getState();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    pwaStore.setDeferredPrompt(event as BeforeInstallPromptEvent);
    pwaStore.setInstallable(true);
  });

  window.addEventListener('appinstalled', () => {
    pwaStore.setInstalled(true);
    pwaStore.setInstallable(false);
    pwaStore.setDeferredPrompt(null);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col">
      <QueryClientProvider client={queryClient}>
        <TopLoader />
        <BrowserRouter>
          <AccessibilityProvider>
            <RootRouter />
          </AccessibilityProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </div>
  </StrictMode>,
);

if ('storage' in navigator && 'persist' in navigator.storage) {
  void navigator.storage.persist();
}
