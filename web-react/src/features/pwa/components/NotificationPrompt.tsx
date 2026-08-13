import { useState, useEffect } from 'react';
import { FiBell, FiX } from 'react-icons/fi';
import { useAuthStore } from '../../auth/authStore';
import { isAppleMobileWeb, isInstalledPwa } from '../utils/pwaEnvironment';
import { useDeviceNotificationPermission } from '../../../hooks/useDeviceNotificationPermission';
import {
  markNotificationPromptDismissedThisSession,
  NOTIF_PROMPT_SESSION_DISMISSED_EVENT,
  notificationPermissionSettingsHint,
  wasNotificationPromptDismissedThisSession,
} from '../../../lib/deviceNotificationPermission';
import { emitAppToast } from '../../../lib/uiFeedback';

export function NotificationPrompt() {
  const token = useAuthStore((s) => s.token);
  const { state, missing, busy, request } = useDeviceNotificationPermission();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const showIosSafariNote = isAppleMobileWeb() && !isInstalledPwa();

  useEffect(() => {
    setDismissed(wasNotificationPromptDismissedThisSession());
    const onDismissed = () => setDismissed(true);
    window.addEventListener(NOTIF_PROMPT_SESSION_DISMISSED_EVENT, onDismissed);
    return () => window.removeEventListener(NOTIF_PROMPT_SESSION_DISMISSED_EVENT, onDismissed);
  }, []);

  useEffect(() => {
    if (!token?.trim()) {
      setVisible(false);
      return;
    }
    if (state === 'loading' || busy) {
      return;
    }
    setVisible(missing && !dismissed);
  }, [token, state, missing, busy, dismissed]);

  const handleAllow = async () => {
    const result = await request();
    if (result === 'granted') {
      setVisible(false);
      return;
    }
    emitAppToast(
      result === 'denied'
        ? notificationPermissionSettingsHint()
        : 'Не удалось включить уведомления. Без них вы не узнаете, когда пишут в чате.',
      'error',
    );
  };

  const handleDismiss = () => {
    markNotificationPromptDismissedThisSession();
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
              Без разрешения на устройстве вы не получите сигнал, когда вам пишут в чате. Разрешите все
              уведомления — иначе сообщения видны только при открытом приложении.
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
            onClick={() => void handleAllow()}
            disabled={busy}
            className={[
              'flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-primary/25',
              'transition-all hover:bg-primary-dark active:scale-[0.98] disabled:opacity-50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
              'dark:text-[var(--text-on-primary)]',
            ].join(' ')}
          >
            {busy ? 'Подключение...' : 'Включить'}
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
