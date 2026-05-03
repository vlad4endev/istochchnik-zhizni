import { useEffect, useState } from 'react';
import { LuX, LuShare } from 'react-icons/lu';
import { useBrandingStore } from '../features/branding/brandingStore';

const STORAGE_KEY = 'ios-install-banner-dismissed';

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari =
    /safari/i.test(ua) &&
    !/chrome|crios|fxios|android/i.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  try {
    if (
      'standalone' in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    ) {
      return true;
    }
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);
  const appName = useBrandingStore((s) => s.appName);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);

  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return;

    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  }

  if (!visible) return null;

  return (
    <>
      {/* Лёгкий градиент снизу — визуальная опора, не перехватывает клики */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998] bg-gradient-to-t from-black/[0.14] via-transparent to-transparent dark:from-black/55"
      />

      <div
        role="dialog"
        aria-label="Установить приложение"
        aria-modal="false"
        className="motion-reduce:animate-none pointer-events-none fixed bottom-[calc(var(--app-bottom-nav-total-height)+0.75rem)] left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md animate-pwa-ios-install-in"
      >
        <div className="pointer-events-auto relative">
          <div
            className={[
              'flex flex-col gap-3 rounded-[1.25rem] border border-stone-200/80 p-4 pb-[1.05rem]',
              'bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] backdrop-blur-md',
              'dark:border-[var(--glass-border)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)]',
            ].join(' ')}
          >
            <div className="flex items-center gap-3">
              <div
                className={[
                  'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl',
                  'bg-[var(--primary)] shadow-md shadow-[var(--primary)]/35',
                ].join(' ')}
              >
                {customLogoDataUrl ? (
                  <img
                    src={customLogoDataUrl}
                    alt=""
                    className="h-full w-full object-contain p-1.5"
                  />
                ) : (
                  <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain p-1.5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="m-0 text-[0.9375rem] font-extrabold leading-tight text-[var(--text)]">
                  Установить {appName}
                </p>
                <p className="mt-0.5 text-[0.75rem] font-medium leading-snug text-[var(--text-muted)]">
                  Добавьте приложение на экран&nbsp;«Домой»
                </p>
              </div>

              <button
                type="button"
                onClick={dismiss}
                aria-label="Закрыть"
                className={[
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                  'bg-stone-500/10 text-[var(--text-secondary)] transition-colors',
                  'hover:bg-stone-500/15 active:scale-[0.97]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--a11y-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-elevated)]',
                  'dark:bg-white/10 dark:hover:bg-white/[0.14]',
                ].join(' ')}
              >
                <LuX className="h-4 w-4" strokeWidth={2.5} aria-hidden />
              </button>
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-primary/[0.07] px-3.5 py-2.5 dark:bg-primary/15">
              <Step
                num={1}
                text={
                  <>
                    Нажмите{' '}
                    <LuShare
                      aria-hidden
                      className="inline-block h-[1em] w-[1em] align-[-0.2em] text-[var(--primary)]"
                      strokeWidth={2}
                    />{' '}
                    <strong className="font-extrabold text-[var(--text)]">«Поделиться»</strong> в панели Safari
                  </>
                }
              />
              <Step
                num={2}
                text={
                  <>
                    Выберите{' '}
                    <strong className="font-extrabold text-[var(--text)]">«На экран «Домой»»</strong>
                  </>
                }
              />
              <Step
                num={3}
                text={
                  <>
                    Нажмите <strong className="font-extrabold text-[var(--text)]">«Добавить»</strong>
                  </>
                }
              />
            </div>
          </div>

          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[10px] border-x-transparent border-t-[color:var(--surface-elevated)] opacity-[0.94] drop-shadow-[0_2px_2px_rgba(0,0,0,0.08)] dark:opacity-90"
          />
        </div>
      </div>
    </>
  );
}

function Step({ num, text }: { num: number; text: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-extrabold leading-none',
          'bg-[var(--primary)] text-[var(--text-on-primary)]',
        ].join(' ')}
      >
        {num}
      </span>
      <span className="text-[0.8125rem] font-medium leading-snug text-[var(--text-secondary)]">{text}</span>
    </div>
  );
}
