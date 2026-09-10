import { useEffect } from 'react';

export function useAppUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let swFetchFailureCooldownUntil = 0;
    let swFetchFailureLogged = false;

    /**
     * Применяет обновление только `PWAUpdatePrompt` (`registerType: 'prompt'`), и он же
     * перезагружает вкладку после `controlling`. Здесь остаётся страховка для остальных
     * вкладок: SW сменился в соседней вкладке — эта подхватывает новую версию.
     *
     * `hadController` обязателен: при самой первой установке SW тоже приходит
     * `controllerchange`, и без проверки первый визит заканчивался бы перезагрузкой.
     */
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    const onControllerChange = () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const checkUpdate = async () => {
      if (Date.now() < swFetchFailureCooldownUntil) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          /** iOS: `update()` иногда «висит» на сети минутами — не блокируем холодный старт. */
          await Promise.race([
            reg.update(),
            new Promise<void>((resolve) => {
              window.setTimeout(resolve, 10_000);
            }),
          ]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? '');
        const isSwScriptFetchError =
          message.includes('when fetching the script') ||
          message.includes('An unknown error occurred when fetching the script') ||
          message.includes('bad HTTP response code') ||
          message.includes('504') ||
          (message.includes('ServiceWorker') && message.includes('fetch'));
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
