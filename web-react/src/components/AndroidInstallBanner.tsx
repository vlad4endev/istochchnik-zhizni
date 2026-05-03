import { useEffect, useRef, useState } from 'react';
import { LuDownload, LuX, LuSmartphone } from 'react-icons/lu';
import { useBrandingStore } from '../features/branding/brandingStore';
import { usePwaStore } from '../stores/pwaStore';

const DISMISSED_KEY = 'android-install-banner-dismissed';
const DISMISS_TTL_DAYS = 3;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return false;
    const diffDays = (Date.now() - ts) / 86_400_000;
    return diffDays < DISMISS_TTL_DAYS;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

type BannerState = 'hidden' | 'visible' | 'installing' | 'installed';

export function AndroidInstallBanner() {
  const [state, setState] = useState<BannerState>('hidden');
  const showTimerRef = useRef<number | null>(null);
  const deferredPrompt = usePwaStore((s) => s.deferredPrompt);
  const setDeferredPrompt = usePwaStore((s) => s.setDeferredPrompt);
  const isInstallable = usePwaStore((s) => s.isInstallable);
  const setInstallable = usePwaStore((s) => s.setInstallable);
  const isInstalled = usePwaStore((s) => s.isInstalled);

  const appName = useBrandingStore((s) => s.appName);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);

  useEffect(() => {
    if (!isAndroid()) return;
    if (isStandalone()) return;
    if (isDismissed()) return;
  }, []);

  useEffect(() => {
    if (!isAndroid() || isStandalone() || isDismissed()) return;
    if (!isInstallable || !deferredPrompt || isInstalled) return;

    showTimerRef.current = window.setTimeout(() => setState('visible'), 2000);
    return () => {
      if (showTimerRef.current !== null) {
        window.clearTimeout(showTimerRef.current);
      }
    };
  }, [deferredPrompt, isInstallable, isInstalled]);

  useEffect(() => {
    if (isInstalled) {
      setState('installed');
      const hideId = window.setTimeout(() => setState('hidden'), 3000);
      return () => window.clearTimeout(hideId);
    }
  }, [isInstalled]);

  async function handleInstall() {
    const prompt = deferredPrompt;
    if (!prompt) return;

    setState('installing');
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        setInstallable(false);
        setDeferredPrompt(null);
        setState('installed');
        setTimeout(() => setState('hidden'), 3000);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    }
  }

  function dismiss() {
    setState('hidden');
    setInstallable(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  }

  if (state === 'hidden') return null;

  const backdropInteractive = state === 'visible';

  return (
    <>
      <div
        aria-hidden={!backdropInteractive}
        onClick={backdropInteractive ? dismiss : undefined}
        className={[
          'fixed inset-0 z-[9998] transition-[opacity,backdrop-filter] duration-300',
          backdropInteractive
            ? 'pointer-events-auto bg-black/35 backdrop-blur-[2px] dark:bg-black/60'
            : 'pointer-events-none bg-transparent',
        ].join(' ')}
      />

      <div
        role="dialog"
        aria-label="Установить приложение"
        aria-modal="false"
        className="motion-reduce:animate-none pointer-events-none fixed bottom-0 left-0 right-0 z-[9999] animate-pwa-android-sheet-in pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="pointer-events-auto">
          <div
            className={[
              'rounded-t-[1.5rem] border border-b-0 border-stone-200/90 px-5 pb-6 pt-1 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]',
              'bg-[var(--surface-elevated)] text-[var(--text)]',
              'dark:border-[var(--glass-border)] dark:shadow-[0_-12px_48px_rgba(0,0,0,0.55)]',
            ].join(' ')}
          >
            {state === 'installed' ? (
              <InstalledState />
            ) : (
              <>
                <div
                  aria-hidden
                  className="mx-auto mb-5 mt-2 h-1 w-10 rounded-full bg-[var(--text-muted)]/25"
                />

                <div className="mb-5 flex items-center gap-4">
                  <div
                    className={[
                      'flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.125rem]',
                      'bg-[var(--primary)] shadow-lg shadow-[var(--primary)]/30',
                    ].join(' ')}
                  >
                    {customLogoDataUrl ? (
                      <img
                        src={customLogoDataUrl}
                        alt=""
                        className="h-full w-full object-contain p-2"
                      />
                    ) : (
                      <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain p-2" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-base font-extrabold leading-tight text-[var(--text)]">
                      Установить {appName}
                    </p>
                    <p className="mt-1 text-[0.8125rem] font-medium leading-snug text-[var(--text-muted)]">
                      Добавьте на экран «Домой» — работает&nbsp;как&nbsp;приложение
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip icon="⚡" label="Быстро" />
                      <Chip icon="📴" label="Офлайн" />
                      <Chip icon="🔔" label="Уведомления" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Закрыть"
                    className={[
                      'flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full',
                      'bg-stone-500/10 text-[var(--text-secondary)] transition-colors',
                      'hover:bg-stone-500/15 active:scale-[0.97]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
                      'dark:bg-white/10 dark:hover:bg-white/[0.14]',
                    ].join(' ')}
                  >
                    <LuX className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={dismiss}
                    className={[
                      'shrink-0 rounded-[0.875rem] border border-stone-300/90 px-5 py-3 text-sm font-bold',
                      'text-[var(--text-secondary)] transition-colors',
                      'hover:bg-stone-500/[0.06] active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2',
                      'dark:border-[var(--glass-border)] dark:hover:bg-white/[0.06]',
                    ].join(' ')}
                  >
                    Позже
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    disabled={state === 'installing'}
                    aria-busy={state === 'installing'}
                    className={[
                      'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[0.875rem] px-4 py-3',
                      'text-sm font-bold text-[var(--text-on-primary)] transition-transform active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
                      state === 'installing'
                        ? 'cursor-default bg-[var(--primary)]/75'
                        : 'bg-[var(--primary)] motion-safe:animate-pwa-android-pulse-ring motion-reduce:animate-none',
                    ].join(' ')}
                  >
                    {state === 'installing' ? (
                      <>
                        <LuSmartphone className="h-[1.1rem] w-[1.1rem] shrink-0" strokeWidth={2} aria-hidden />
                        Установка…
                      </>
                    ) : (
                      <>
                        <LuDownload className="h-[1.1rem] w-[1.1rem] shrink-0" strokeWidth={2.5} aria-hidden />
                        Установить
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold leading-snug',
        'bg-primary/10 text-[var(--primary)] ring-1 ring-primary/20 dark:bg-primary/20 dark:ring-primary/30',
      ].join(' ')}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function InstalledState() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 pb-2 pt-4 text-center">
      <div
        className="motion-reduce:animate-none flex h-16 w-16 animate-pwa-android-check-in items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-400/20"
        aria-hidden
      >
        <span className="text-3xl text-emerald-600 dark:text-emerald-400">✓</span>
      </div>
      <div>
        <p className="m-0 text-[1.0625rem] font-extrabold text-[var(--text)]">Приложение установлено!</p>
        <p className="mt-1 text-[0.8125rem] font-medium text-[var(--text-muted)]">Найдите его на экране «Домой»</p>
      </div>
    </div>
  );
}
