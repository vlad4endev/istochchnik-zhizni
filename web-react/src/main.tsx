import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { isAxiosError } from 'axios';
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
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { PWAUpdatePrompt } from './components/PWAUpdatePrompt';
import { TopLoader } from './components/ui/TopLoader';
import { AccessibilityProvider } from './lib/accessibility/AccessibilityProvider';
import { getAppVariant } from './lib/appVariant';
import { SessionKeepAlive } from './hooks/SessionKeepAlive';
import { ImpersonationBanner } from './features/admin/components/ImpersonationBanner';
import { initAuthCrossTabLocalStorageSync } from './features/auth/authStore';
import { useViewportHeight } from './hooks/useViewportHeight';
import { useAppUpdate } from './hooks/useAppUpdate';
import { usePwaStore, type BeforeInstallPromptEvent } from './stores/pwaStore';
import { initAppearance, useAppearanceStore } from './stores/useAppearanceStore';
import { appearanceColorSchemeManager } from './lib/mantineAppearanceColorSchemeManager';
import { theme } from './lib/theme';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';
import './styles/mobile.css';

const CLIENT_BUILD_VERSION = '2026-06-18-android-bidi-fix-1';
const CLIENT_BUILD_VERSION_KEY = 'app:client-build-version';
const CLIENT_BUILD_RELOAD_KEY = 'app:client-build-reload-once';

/** Progressier: не в index.html — иначе на iOS PWA конкурирует с первым бандлом и SW. Включать только если в Progressier настроен домен и хостится их скрипт. */
const PROGRESSIER_SCRIPT_SRC = 'https://progressier.app/j7yZLwkCdnvJhlAZ1Gor/script.js';

function scheduleProgressierAfterFirstPaint(): void {
  if (import.meta.env.VITE_PROGRESSIER_ENABLED !== 'true') return;
  const inject = (): void => {
    if (document.querySelector('script[data-app-progressier="1"]')) return;
    const s = document.createElement('script');
    s.async = true;
    s.dataset.appProgressier = '1';
    s.src = PROGRESSIER_SCRIPT_SRC;
    document.head.appendChild(s);
  };
  const whenIdle = (): void => {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => inject(), { timeout: 8000 });
    } else {
      window.setTimeout(inject, 4000);
    }
  };
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(whenIdle);
  });
}

/**
 * После деплоя старый SW может отдать index.html, а chunk — уже удалён с CDN → белый экран.
 * Один автоматический reload за сессию при типичной ошибке динамического import() или script src.
 */
function registerPwaStaleDeployRecovery(): void {
  const KEY = 'pwa:lazy-chunk-reload-once';

  const tryReloadOnce = (reason: string, detail: string): void => {
    try {
      if (sessionStorage.getItem(KEY) === '1') return;
      sessionStorage.setItem(KEY, '1');
    } catch {
      return;
    }
    console.warn(`[PWA] ${reason} Перезагрузка.`, detail);
    window.location.reload();
  };

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const r = event.reason;
    const msg = r instanceof Error ? r.message : String(r ?? '');
    if (
      !/dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed/i.test(
        msg,
      )
    ) {
      return;
    }
    tryReloadOnce('Не удалось загрузить JS-модуль (часто после выкладки).', msg);
  });

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      const el = event.target;
      if (!el || !(el instanceof HTMLScriptElement)) return;
      const src = el.src || '';
      if (!src || !/\/assets\/.*\.js/i.test(src)) return;
      tryReloadOnce('Не удалось загрузить script (часто после выкладки).', src);
    },
    true,
  );
}

/** Не дублировать POST и не усиливать 429; повтор только при сетевых/5xx сбоях. */
function defaultQueryRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  if (isAxiosError(error)) {
    const s = error.response?.status;
    if (s === 429) return false;
    if (s != null && s >= 400 && s < 500 && s !== 408) return false;
    return true;
  }
  return true;
}

async function forceClientRefreshOnVersionChange(): Promise<void> {
  if (typeof window === 'undefined') return;
  let previousVersion = '';
  try {
    previousVersion = localStorage.getItem(CLIENT_BUILD_VERSION_KEY) ?? '';
    localStorage.setItem(CLIENT_BUILD_VERSION_KEY, CLIENT_BUILD_VERSION);
  } catch {
    return;
  }

  if (!previousVersion || previousVersion === CLIENT_BUILD_VERSION) return;

  try {
    const alreadyReloaded = sessionStorage.getItem(CLIENT_BUILD_RELOAD_KEY);
    if (alreadyReloaded === CLIENT_BUILD_VERSION) return;
    sessionStorage.setItem(CLIENT_BUILD_RELOAD_KEY, CLIENT_BUILD_VERSION);
  } catch {
    // ignore storage failures and continue best-effort cleanup
  }

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        /** iOS: unregister() без верхней границы может «висеть» минутами. */
        await Promise.race([
          registration.unregister(),
          new Promise<void>((r) => {
            window.setTimeout(r, 8000);
          }),
        ]);
      }
    }
  } catch {
    // ignore service worker errors
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.race([
        Promise.all(keys.map((key) => caches.delete(key))),
        new Promise<void>((r) => {
          window.setTimeout(r, 12_000);
        }),
      ]);
    }
  } catch {
    // ignore cache cleanup errors
  }

  window.location.reload();
}

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
void forceClientRefreshOnVersionChange();
void Promise.race([
  client.ping(),
  new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('appwrite ping timeout')), 5000);
  }),
]).catch((error: unknown) => {
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

function ViewportHeightBridge() {
  useViewportHeight();
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      /** PWA iOS: при выходе из фона + «online» иначе лавина refetch бьёт API и тормозит первый кадр. */
      refetchOnReconnect: false,
      /** Офлайн: не крутить запросы вхолостую; при online снова активируются. */
      networkMode: 'online',
      retry: defaultQueryRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      staleTime: 60_000,
      gcTime: 300_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

if (typeof window !== 'undefined') {
  initAuthCrossTabLocalStorageSync();
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

  registerPwaStaleDeployRecovery();
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML =
    '<p style="font-family:system-ui;padding:16px">Не найден #root — проверьте сборку index.html.</p>';
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
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
              <ViewportHeightBridge />
              <TopLoader />
              <BrowserRouter>
                <AccessibilityProvider>
                  <ImpersonationBanner />
                  <SessionKeepAlive />
                  <RootRouter />
                  <MediaViewer />
                </AccessibilityProvider>
              </BrowserRouter>
            </QueryClientProvider>
          </div>
        </MantineProvider>
      </AppErrorBoundary>
    </StrictMode>,
  );
  scheduleProgressierAfterFirstPaint();
}

if ('storage' in navigator && 'persist' in navigator.storage) {
  void navigator.storage.persist();
}
