import { useEffect } from 'react';

export function useAppUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const UPDATE_PROMPT_DISMISS_KEY = 'pwa:update-prompt:dismissed-until';
    let swFetchFailureCooldownUntil = 0;
    let swFetchFailureLogged = false;

    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const forceSkipWaitingIfNeeded = async () => {
      let dismissedUntil = 0;
      try {
        const raw = sessionStorage.getItem(UPDATE_PROMPT_DISMISS_KEY);
        dismissedUntil = raw ? Number.parseInt(raw, 10) : 0;
      } catch {
        dismissedUntil = 0;
      }
      if (!Number.isFinite(dismissedUntil) || dismissedUntil <= Date.now()) {
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const waiting = reg?.waiting;
      if (!waiting) return;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    };

    const checkUpdate = async () => {
      if (Date.now() < swFetchFailureCooldownUntil) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
        void forceSkipWaitingIfNeeded();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        const isSwScriptFetchError =
          message.includes('Failed to update a ServiceWorker') &&
          message.includes('when fetching the script');
        if (isSwScriptFetchError) {
          // Don't spam console when CDN/origin temporarily returns 5xx for sw.js.
          swFetchFailureCooldownUntil = Date.now() + 5 * 60 * 1000;
          if (!swFetchFailureLogged) {
            swFetchFailureLogged = true;
            console.warn(
              'Service Worker script is temporarily unreachable; retrying later.',
              error,
            );
          }
          return;
        }
        console.warn('Service Worker update check failed:', error);
      }
    };
    void checkUpdate();
    const interval = setInterval(checkUpdate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
