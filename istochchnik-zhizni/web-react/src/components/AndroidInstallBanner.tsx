import { useEffect, useRef, useState } from 'react';
import { LuDownload, LuX, LuSmartphone } from 'react-icons/lu';
import { useBrandingStore } from '../features/branding/brandingStore';

const DISMISSED_KEY = 'android-install-banner-dismissed';
// Через сколько дней показать снова, если пользователь закрыл (не установил)
const DISMISS_TTL_DAYS = 3;

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

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
  return window.matchMedia('(display-mode: standalone)').matches;
}

function isAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

type BannerState = 'hidden' | 'visible' | 'installing' | 'installed';

export function AndroidInstallBanner() {
  const [state, setState] = useState<BannerState>('hidden');
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const appName = useBrandingStore((s) => s.appName);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);

  useEffect(() => {
    // Баннер только на Android-браузерах без standalone
    if (!isAndroid()) return;
    if (isStandalone()) return;
    if (isDismissed()) return;

    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      // Пауза 2 с, чтобы пользователь успел осмотреться
      setTimeout(() => setState('visible'), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstall() {
    const prompt = promptRef.current;
    if (!prompt) return;

    setState('installing');
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
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
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch { /* ignore */ }
  }

  if (state === 'hidden') return null;

  return (
    <>
      <style>{`
        @keyframes android-banner-slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes android-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(125,54,64,0.35); }
          50%       { box-shadow: 0 0 0 8px rgba(125,54,64,0); }
        }
        @keyframes android-check-in {
          from { transform: scale(0.5) rotate(-10deg); opacity: 0; }
          to   { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .android-install-btn {
          transition: background 0.15s, transform 0.1s;
        }
        .android-install-btn:active {
          transform: scale(0.96);
        }
      `}</style>

      {/* Бэкдроп — лёгкое затемнение снизу */}
      <div
        aria-hidden
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9998,
          background: 'transparent',
          pointerEvents: state === 'visible' ? 'auto' : 'none',
        }}
      />

      <div
        role="dialog"
        aria-label="Установить приложение"
        aria-modal="false"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          padding: '0 0 env(safe-area-inset-bottom, 0px)',
          animation: 'android-banner-slide-up 0.4s cubic-bezier(0.22,1,0.36,1) both',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            borderRadius: '24px 24px 0 0',
            boxShadow: '0 -4px 32px rgba(0,0,0,0.12), 0 -1px 0 rgba(0,0,0,0.06)',
            padding: '1.25rem 1.25rem 1.5rem',
          }}
        >
          {state === 'installed' ? (
            /* ── Состояние «Установлено» ── */
            <InstalledState />
          ) : (
            /* ── Основной баннер ── */
            <>
              {/* Ручка-индикатор (как в Bottom Sheet) */}
              <div
                aria-hidden
                style={{
                  width: '2.5rem',
                  height: '4px',
                  borderRadius: '2px',
                  background: 'rgba(0,0,0,0.12)',
                  margin: '0 auto 1.25rem',
                }}
              />

              {/* Контент */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                {/* Иконка приложения */}
                <div
                  style={{
                    width: '3.5rem',
                    height: '3.5rem',
                    borderRadius: '18px',
                    background: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(125,54,64,0.30)',
                  }}
                >
                  {customLogoDataUrl ? (
                    <img
                      src={customLogoDataUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
                    />
                  ) : (
                    <img
                      src="/assets/logo.svg"
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }}
                    />
                  )}
                </div>

                {/* Текст */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 800,
                      color: '#1c1917',
                      lineHeight: 1.25,
                    }}
                  >
                    Установить {appName}
                  </p>
                  <p
                    style={{
                      margin: '0.25rem 0 0',
                      fontSize: '0.8125rem',
                      color: '#78716c',
                      lineHeight: 1.4,
                    }}
                  >
                    Добавьте на экран «Домой» — работает&nbsp;как&nbsp;приложение
                  </p>

                  {/* Преимущества */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <Chip icon="⚡" label="Быстро" />
                    <Chip icon="📴" label="Офлайн" />
                    <Chip icon="🔔" label="Уведомления" />
                  </div>
                </div>

                {/* Кнопка закрытия */}
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Закрыть"
                  style={{
                    alignSelf: 'flex-start',
                    flexShrink: 0,
                    width: '2.25rem',
                    height: '2.25rem',
                    border: 'none',
                    background: 'rgba(0,0,0,0.06)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#78716c',
                    padding: 0,
                  }}
                >
                  <LuX style={{ width: '1rem', height: '1rem' }} strokeWidth={2.5} />
                </button>
              </div>

              {/* Кнопки действий */}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={dismiss}
                  style={{
                    flex: '0 0 auto',
                    padding: '0.75rem 1.25rem',
                    border: '1.5px solid rgba(0,0,0,0.10)',
                    borderRadius: '14px',
                    background: 'transparent',
                    color: '#57534e',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Позже
                </button>

                <button
                  type="button"
                  onClick={() => void handleInstall()}
                  disabled={state === 'installing'}
                  className="android-install-btn"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.25rem',
                    border: 'none',
                    borderRadius: '14px',
                    background: state === 'installing'
                      ? 'rgba(125,54,64,0.7)'
                      : 'var(--primary)',
                    color: '#fff',
                    fontSize: '0.9375rem',
                    fontWeight: 700,
                    cursor: state === 'installing' ? 'default' : 'pointer',
                    animation: state !== 'installing' ? 'android-pulse 2s ease-in-out infinite' : 'none',
                  }}
                  aria-busy={state === 'installing'}
                >
                  {state === 'installing' ? (
                    <>
                      <LuSmartphone style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }} strokeWidth={2} />
                      Установка…
                    </>
                  ) : (
                    <>
                      <LuDownload style={{ width: '1.1rem', height: '1.1rem', flexShrink: 0 }} strokeWidth={2.5} />
                      Установить
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        background: 'rgba(125,54,64,0.08)',
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: 'var(--primary)',
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

function InstalledState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '1.5rem 1rem 0.5rem',
        gap: '0.75rem',
      }}
    >
      <div
        style={{
          width: '4rem',
          height: '4rem',
          borderRadius: '50%',
          background: 'rgba(13,188,136,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'android-check-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        <span style={{ fontSize: '2rem' }} aria-hidden>✓</span>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: '1.0625rem', fontWeight: 800, color: '#1c1917' }}>
          Приложение установлено!
        </p>
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: '#78716c' }}>
          Найдите его на экране «Домой»
        </p>
      </div>
    </div>
  );
}
