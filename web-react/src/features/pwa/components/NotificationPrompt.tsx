import { useState, useEffect } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import { useAuthStore } from '../../auth/authStore';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { isAppleMobileWeb, isInstalledPwa } from '../utils/pwaEnvironment';

export function NotificationPrompt() {
  const token = useAuthStore((s) => s.token);
  const { status, subscribe, loading, isSubscribed } = useNotificationManager();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const showIosSafariNote = isAppleMobileWeb() && !isInstalledPwa();

  useEffect(() => {
    if (!token?.trim()) {
      setVisible(false);
      return;
    }
    if (status === 'default' && !isSubscribed && !loading && !dismissed) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [token, status, isSubscribed, loading, dismissed]);

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
        {showIosSafariNote ? (
          <div className="border-b border-amber-200/90 bg-amber-50/95 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
            <p className="font-extrabold text-amber-950">iPhone / iPad</p>
            <p className="mt-1 text-amber-900/90">
              Для фоновых push лучше добавить сайт на экран «Домой» (Поделиться → На экран «Домой») и открыть
              ярлык. Ниже всё равно можно запросить разрешение — если открыты из Safari, часть функций может быть
              ограничена.
            </p>
          </div>
        ) : null}

        <div className="relative p-5 flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <FiBell className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-sm font-extrabold text-stone-900 leading-tight">Включить уведомления?</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
              Сообщения в чатах и напоминания — в том числе при блокировке экрана. Один раз разрешите уведомления в
              системе.
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
