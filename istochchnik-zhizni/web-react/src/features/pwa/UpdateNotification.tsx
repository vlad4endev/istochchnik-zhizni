import { useEffect } from 'react';
import './UpdateNotification.css';

interface UpdateNotificationProps {
  onDismiss?: () => void;
  autoReload?: boolean;
}

/**
 * Выглядит как уведомление об обновлении PWA приложения.
 * Автоматически обновляет страницу при обновлении Service Worker.
 */
export function UpdateNotification({ onDismiss, autoReload = true }: UpdateNotificationProps) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      if (autoReload) {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [autoReload]);

  const handleUpdate = () => {
    if (autoReload) {
      window.location.reload();
    }
    onDismiss?.();
  };

  return (
    <div className="update-notification">
      <div className="update-notification__content">
        <span className="update-notification__message">
          ✨ Доступно обновление приложения
        </span>
        <button
          className="update-notification__button"
          onClick={handleUpdate}
          type="button"
        >
          Обновить
        </button>
      </div>
    </div>
  );
}
