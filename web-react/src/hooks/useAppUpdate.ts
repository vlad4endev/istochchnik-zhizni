import { useEffect } from 'react';

export function useAppUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const checkUpdate = async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      void reg?.update();
    };
    const interval = setInterval(checkUpdate, 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
