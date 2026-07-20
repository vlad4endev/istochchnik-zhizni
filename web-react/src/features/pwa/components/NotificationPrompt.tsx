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
    const isDismissed = localStorage.getItem('push_banner_dismissed') === 'true';
    if (isDismissed) {
      setDismissed(true);
    }
  }, []);

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
    const result = await subscribe();
    if (result.ok) {
      setVisible(false);
      return;
    }
    // Keep banner visible; surface the failure so users are not left thinking push is on.
    const detail =
      result.error?.trim() ||
      'Не удалось сохранить подписку. Проверьте интернет и попробуйте снова — или откройте Профиль → Уведомления.';
    window.dispatchEvent(
      new CustomEvent('app:toast', {
        detail: { message: detail, kind: 'error' as const },
      }),
    );
  };

  const handleDismiss = () => {
    localStorage.setItem('push_banner_dismissed', 'true');
    setDismissed(true);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="motion-reduce:animate-none fixed left-4 right-4 top-4 z-[100] animate-pwa-notify-banner-in md:left-auto md:right-6 md:w-96">
      <div
        className={[
          'flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]',
          'border-stone-200/90 bg-[var(--surface-elevated)]',
          'dark:border-[var(--glass-border)] dark:shadow-[var(--shadow)]',
        ].join(' ')}
      >
        {showIosSafariNote ? (
          <div
            className={[
              'border-b px-4 py-3 text-[12px] font-medium leading-relaxed',
              'border-amber-200/90 bg-amber-50/95 text-amber-950',
              'dark:border-amber-500/25 dark:bg-amber-950/55 dark:text-amber-50',
            ].join(' ')}
          >
            <p className="font-extrabold tracking-tight">iPhone / iPad</p>
            <p className="mt-1 opacity-95 dark:text-amber-100/90">
              Для фоновых push лучше добавить сайт на экран «Домой» (Поделиться → На экран «Домой») и открыть
              ярлык. Ниже всё равно можно запросить разрешение — если открыты из Safari, часть функций может быть
              ограничена.
            </p>
          </div>
        ) : null}

        <div className="relative flex items-start gap-4 p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
            <FiBell className="h-6 w-6 text-[var(--primary)]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pr-10">
            <h3 className="text-sm font-extrabold leading-tight text-[var(--text)]">Включить уведомления?</h3>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-[var(--text-muted)]">
              Сообщения в чатах и напоминания — в том числе при блокировке экрана. Один раз разрешите уведомления в
              системе.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className={[
              'absolute right-3 top-3 rounded-full p-2 text-[var(--text-muted)] transition-colors',
              'hover:bg-stone-500/10 hover:text-[var(--text-secondary)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
              'dark:hover:bg-white/10',
            ].join(' ')}
            aria-label="Закрыть"
          >
            <FiX className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex items-center gap-3 px-5 pb-5">
          <button
            type="button"
            onClick={handleAllow}
            disabled={loading}
            className={[
              'flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-primary/25',
              'transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
              'dark:text-[var(--text-on-primary)]',
            ].join(' ')}
          >
            {loading ? 'Подключение...' : 'Включить'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className={[
              'rounded-xl bg-stone-500/10 px-4 py-2.5 text-sm font-extrabold text-[var(--text-secondary)] transition-colors',
              'hover:bg-stone-500/15 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
              'dark:bg-white/10 dark:hover:bg-white/[0.14]',
            ].join(' ')}
          >
            Позже
          </button>
        </div>
      </div>
    </div>
  );
}
