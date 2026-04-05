import { useState, useEffect } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { isAppleMobileWeb, isInstalledPwa } from '../utils/pwaEnvironment';

export function NotificationPrompt() {
  const { status, subscribe, loading, isSubscribed } = useNotificationManager();
  const [visible, setVisible] = useState(false);
  const [iosBrowserHint, setIosBrowserHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const appleTouch = isAppleMobileWeb();
    const installed = isInstalledPwa();

    if (status === 'default' && !isSubscribed && !loading && !dismissed) {
      // Только вкладка Safari: веб-пуш для чатов недоступен. Ярлык с «Домой» = installed → показываем обычный запрос.
      if (appleTouch && !installed) {
        setIosBrowserHint(true);
        setVisible(false);
      } else {
        setIosBrowserHint(false);
        setVisible(true);
      }
    } else {
      setVisible(false);
      setIosBrowserHint(false);
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
    setIosBrowserHint(false);
  };

  if (iosBrowserHint) {
    return (
      <div className="fixed top-4 left-4 right-4 z-[100] md:left-auto md:right-6 md:max-w-md animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/95 p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <FiBell className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold text-amber-950">Уведомления о чатах на iPhone</p>
              <p className="mt-1 text-[13px] leading-relaxed text-amber-900/85">
                В Safari без установки на главный экран веб-уведомления недоступны. Нажмите «Поделиться» и
                добавьте сайт на экран «Домой», откройте ярлык и включите уведомления — тогда придут сообщения в
                чаты, даже когда приложение свёрнуто.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 rounded-full p-1 text-amber-800/70 hover:bg-amber-200/50"
              aria-label="Закрыть"
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              Для PWA на Android и для ярлыка с главного экрана на iPhone: сообщения в чатах и напоминания — в том
              числе при блокировке экрана. Нужно один раз разрешить уведомления в системе.
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
