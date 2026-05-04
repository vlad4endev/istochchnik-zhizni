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
    void checkUpdate();
    const interval = setInterval(checkUpdate, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);
}
