import { useEffect, useState } from 'react';

interface UpdatePrompt {
  show: boolean;
  onUpdate: () => void;
}

/**
 * Hook для автоматического обновления Service Worker.
 * Проверяет обновления каждые 60 секунд и автоматически их применяет.
 * Опционально показывает уведомление пользователю.
 */
export function useServiceWorkerUpdate(options?: { showPrompt?: boolean }) {
  const [updatePrompt, setUpdatePrompt] = useState<UpdatePrompt>({ show: false, onUpdate: () => {} });

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let updateCheckInterval: ReturnType<typeof setInterval>;

    const checkForUpdate = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update();
        }
      } catch (error) {
        console.error('Failed to check for Service Worker updates:', error);
      }
    };

    const handleControllerChange = () => {
      // Service Worker обновился, перезагружаем страницу
      if (options?.showPrompt) {
        setUpdatePrompt({
          show: true,
          onUpdate: () => window.location.reload(),
        });
      } else {
        // Автоматическая перезагрузка
        window.location.reload();
      }
    };

    // Проверяем обновления каждые 60 секунд
    updateCheckInterval = setInterval(checkForUpdate, 60000);

    // Слушаем изменения активного Service Worker
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Первая проверка сразу же
    void checkForUpdate();

    return () => {
      clearInterval(updateCheckInterval);
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [options?.showPrompt]);

  return updatePrompt;
}
