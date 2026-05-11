import { useEffect, useRef, useState } from 'react';

interface UpdatePrompt {
  show: boolean;
  onUpdate: () => void;
  onDismiss?: () => void;
}

/**
 * Hook для автоматического обновления Service Worker.
 * Проверяет обновления каждые 60 секунд и автоматически их применяет.
 * Опционально показывает уведомление пользователю.
 */
export function useServiceWorkerUpdate(options?: { showPrompt?: boolean }) {
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePrompt>({ show: false, onUpdate: () => {} });
  const dismissedForThisSession = useRef(false);
  const reloadOnceRef = useRef(false);
  const swFetchFailureCooldownUntilRef = useRef(0);
  const swFetchFailureLoggedRef = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let updateCheckInterval: ReturnType<typeof setInterval>;
    let alive = true;

    const checkForUpdate = async () => {
      if (Date.now() < swFetchFailureCooldownUntilRef.current) return;

      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        const isSwScriptFetchError =
          message.includes('Failed to update a ServiceWorker') &&
          message.includes('when fetching the script');

        if (isSwScriptFetchError) {
          // Avoid noisy logs every minute when sw.js is temporarily unavailable.
          swFetchFailureCooldownUntilRef.current = Date.now() + 5 * 60 * 1000;
          if (!swFetchFailureLoggedRef.current) {
            swFetchFailureLoggedRef.current = true;
            console.warn(
              'Service Worker script is temporarily unreachable; retrying update checks later.',
              error,
            );
          }
          return;
        }

        console.error('Failed to check for Service Worker updates:', error);
      }
    };

    const maybeShowPrompt = async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;
      if (dismissedForThisSession.current) return;

      // If there is a waiting SW, it means an update is ready to activate.
      const waiting = registration.waiting;
      if (!waiting) return;

      if (!options?.showPrompt) {
        waiting.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      setUpdatePrompt({
        show: true,
        onUpdate: () => {
          waiting.postMessage({ type: 'SKIP_WAITING' });
        },
        onDismiss: () => {
          dismissedForThisSession.current = true;
          setUpdatePrompt({ show: false, onUpdate: () => {} });
        },
      });
    };

    const handleControllerChange = () => {
      // New SW took control -> reload at most once per tab session.
      try {
        if (reloadOnceRef.current) return;
        if (typeof sessionStorage !== 'undefined') {
          const already = sessionStorage.getItem('pwa:reloaded-once');
          if (already === '1') return;
          sessionStorage.setItem('pwa:reloaded-once', '1');
        }
        reloadOnceRef.current = true;
      } catch {
        // ignore storage issues; still avoid multiple reloads in-memory
        if (reloadOnceRef.current) return;
        reloadOnceRef.current = true;
      }
      const jitterMs = Math.floor(Math.random() * 3000);
      window.setTimeout(() => {
        window.location.reload();
      }, jitterMs);
    };

    // Проверяем обновления каждые 60 секунд
    updateCheckInterval = setInterval(checkForUpdate, 60000);

    // Слушаем изменения активного Service Worker
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Первая проверка сразу же
    void checkForUpdate();
    void maybeShowPrompt();

    // Also listen to updatefound -> installed -> waiting.
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (!alive) return;
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              void maybeShowPrompt();
            }
          });
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      alive = false;
      clearInterval(updateCheckInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [options?.showPrompt]);

  return updatePrompt;
}
