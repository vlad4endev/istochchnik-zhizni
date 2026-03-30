import './UpdateNotification.css';

interface UpdateNotificationProps {
  onUpdate?: () => void;
  onDismiss?: () => void;
}

/**
 * Выглядит как уведомление об обновлении PWA приложения.
 * Автоматически обновляет страницу при обновлении Service Worker.
 */
export function UpdateNotification({ onDismiss, onUpdate }: UpdateNotificationProps) {
  const handleUpdate = () => {
    onDismiss?.();
    onUpdate?.();
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
