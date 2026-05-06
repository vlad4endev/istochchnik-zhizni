import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { applyNativeShellViewportLock } from './lib/nativeShellViewport';
import { client } from './lib/appwrite';
import { initPwaStandaloneHtmlHint } from './features/pwa/utils/pwaEnvironment';
import { AppRouter } from './app/Router';
import { AppRouterMain } from './app/RouterMain';
import { AppRouterStudio } from './app/RouterStudio';
import { MediaViewer } from './components/MediaViewer';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { TopLoader } from './components/ui/TopLoader';
import { AccessibilityProvider } from './lib/accessibility/AccessibilityProvider';
import { getAppVariant } from './lib/appVariant';
import { useAppUpdate } from './hooks/useAppUpdate';
import { usePwaStore, type BeforeInstallPromptEvent } from './stores/pwaStore';
import { initAppearance, useAppearanceStore } from './stores/useAppearanceStore';
import { appearanceColorSchemeManager } from './lib/mantineAppearanceColorSchemeManager';
import { theme } from './lib/theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import './styles/mobile.css';

if (import.meta.env.DEV) {
  void import('@welldone-software/why-did-you-render')
    .then(({ default: whyDidYouRender }) => {
      whyDidYouRender(React, {
        trackAllPureComponents: true,
        include: [/Chat/, /Message/, /Avatar/, /ConversationList/],
      });
    })
    .catch(() => {
      // Optional dev profiling helper.
    });
}

applyNativeShellViewportLock();
window.addEventListener('load', () => applyNativeShellViewportLock());
initPwaStandaloneHtmlHint();
initAppearance();
void client.ping().catch((error: unknown) => {
  console.warn('Appwrite ping failed:', error);
});

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

function PwaUpdateListener() {
  useAppUpdate();
  return null;
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
    <MantineProvider
      theme={theme}
      defaultColorScheme="light"
      colorSchemeManager={appearanceColorSchemeManager}
    >
      <Notifications position="top-right" />
      <div className="flex min-h-0 w-full max-w-full flex-1 flex-col">
        <QueryClientProvider client={queryClient}>
          {import.meta.env.PROD ? <PWAUpdatePrompt /> : null}
          <PwaUpdateListener />
          <TopLoader />
          <BrowserRouter>
            <AccessibilityProvider>
              <RootRouter />
              <MediaViewer />
            </AccessibilityProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </div>
    </MantineProvider>
  </StrictMode>,
);

if ('storage' in navigator && 'persist' in navigator.storage) {
  void navigator.storage.persist();
}
