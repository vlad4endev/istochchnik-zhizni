import { useEffect } from 'react';

export function useAppUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const UPDATE_PROMPT_DISMISS_KEY = 'pwa:update-prompt:dismissed-until';

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
      const reg = await navigator.serviceWorker.getRegistration();
      void reg?.update();
      void forceSkipWaitingIfNeeded();
    };
    void checkUpdate();
    const interval = setInterval(checkUpdate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
