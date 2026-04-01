import { useState, useEffect } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import { useNotificationManager } from '../hooks/useNotificationManager';

export function NotificationPrompt() {
  const { status, subscribe, loading, isSubscribed } = useNotificationManager();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Show prompt only if permission is 'default' and not already subscribed
    if (status === 'default' && !isSubscribed && !loading && !dismissed) {
      // Check if it's iOS and if it's standalone
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

      if (isIOS && !isStandalone) {
        // iOS requires PWA installation first for push notifications
        setVisible(false);
      } else {
        // On Android or standalone iOS, show the prompt immediately
        setVisible(true);
      }
    } else {
      setVisible(false);
    }
  }, [status, isSubscribed, loading, dismissed]);

  const handleAllow = async () => {
    const success = await subscribe();
    if (success) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] md:left-auto md:right-6 md:w-96 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col items-stretch">
        <div className="p-5 flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <FiBell className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-sm font-extrabold text-stone-900 leading-tight">
              Включить уведомления?
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
              Получайте ежедневные темы молитвы и важные сообщения от координаторов прямо на ваше устройство.
            </p>
          </div>
          <button 
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-stone-100 text-stone-400 transition-colors"
            aria-label="Закрыть"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>
        
        <div className="px-5 pb-5 flex items-center gap-3">
          <button
            onClick={handleAllow}
            disabled={loading}
            className="flex-1 py-2.5 px-4 bg-primary text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? 'Подключение...' : 'Включить'}
          </button>
          <button
            onClick={handleDismiss}
            className="py-2.5 px-4 bg-stone-100 text-stone-700 text-sm font-bold rounded-xl hover:bg-stone-200 transition-colors"
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
