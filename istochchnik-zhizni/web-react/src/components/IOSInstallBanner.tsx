import { useEffect, useState } from 'react';
import { LuX, LuShare } from 'react-icons/lu';
import { useBrandingStore } from '../features/branding/brandingStore';

const STORAGE_KEY = 'ios-install-banner-dismissed';

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Safari на iOS: нет Chrome, нет Firefox, нет CriOS, нет FxiOS
  const isSafari =
    /safari/i.test(ua) &&
    !/chrome|crios|fxios|android/i.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  // iOS PWA запущен с экрана «Домой»
  return (
    ('standalone' in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export function IOSInstallBanner() {
  const [visible, setVisible] = useState(false);
  const appName = useBrandingStore((s) => s.appName);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);

  useEffect(() => {
    // Показываем только на iOS Safari, не в standalone и если не закрывали раньше
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return;

    // Небольшая задержка для лучшего UX
    const t = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    setVisible(false);
    sessionStorage.setItem(STORAGE_KEY, '1');
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Установить приложение"
      aria-modal="false"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 2rem)',
        maxWidth: '28rem',
        animation: 'ios-banner-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
      }}
    >
      <div
        style={{
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          boxShadow:
            '0 8px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.07)',
          padding: '1rem 1rem 1.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {/* Заголовок */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Иконка приложения */}
          <div
            style={{
              width: '3rem',
              height: '3rem',
              borderRadius: '14px',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(125,54,64,0.30)',
            }}
          >
            {customLogoDataUrl ? (
              <img
                src={customLogoDataUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
              />
            ) : (
              <img
                src="/assets/logo.svg"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
              />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.9375rem',
                fontWeight: 800,
                color: '#1c1917',
                lineHeight: 1.25,
              }}
            >
              Установить {appName}
            </p>
            <p
              style={{
                margin: '0.15rem 0 0',
                fontSize: '0.75rem',
                color: '#78716c',
                lineHeight: 1.3,
              }}
            >
              Добавьте приложение на экран&nbsp;«Домой»
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Закрыть"
            style={{
              flexShrink: 0,
              width: '2rem',
              height: '2rem',
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

        {/* Инструкция */}
        <div
          style={{
            background: 'rgba(125,54,64,0.05)',
            borderRadius: '12px',
            padding: '0.65rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <Step
            num={1}
            text={
              <>
                Нажмите{' '}
                <LuShare
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    verticalAlign: '-0.2em',
                    width: '1em',
                    height: '1em',
                    color: 'var(--primary)',
                  }}
                  strokeWidth={2}
                />{' '}
                <strong>«Поделиться»</strong> в панели Safari
              </>
            }
          />
          <Step
            num={2}
            text={
              <>
                Выберите{' '}
                <strong>«На экран «Домой»»</strong>
              </>
            }
          />
          <Step num={3} text={<>Нажмите <strong>«Добавить»</strong></>} />
        </div>
      </div>

      {/* Стрелка вниз, указывает на панель Safari */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: '-9px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid rgba(255,255,255,0.97)',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.08))',
        }}
      />

      <style>{`
        @keyframes ios-banner-in {
          from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)    scale(1);    }
        }
      `}</style>
    </div>
  );
}

function Step({ num, text }: { num: number; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
      <span
        style={{
          flexShrink: 0,
          width: '1.25rem',
          height: '1.25rem',
          borderRadius: '50%',
          background: 'var(--primary)',
          color: '#fff',
          fontSize: '0.6875rem',
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        {num}
      </span>
      <span style={{ fontSize: '0.8125rem', color: '#44403c', lineHeight: 1.4 }}>{text}</span>
    </div>
  );
}
