import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { LuChurch, LuShield, LuUser, LuWifiOff, LuX } from 'react-icons/lu';

import { LatinCrossIcon } from '../components/LatinCrossIcon';
import { useAuthStore } from '../features/auth/authStore';
import { useBrandingStore } from '../features/branding/brandingStore';
import { useRealtimeQuerySync } from '../hooks/useRealtimeQuerySync';
import { useSyncServerRole } from '../hooks/useSyncServerRole';

type NavItem = {
  to: string;
  label: string;
  Icon: IconType;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  /** Контурные Lucide — не путать с цветными эмодзи / Font Awesome «картинками». */
  { to: '/prayer', label: 'Молитва', Icon: LuChurch },
  { to: '/profile', label: 'Профиль', Icon: LuUser },
  { to: '/admin', label: 'Админ', Icon: LuShield, adminOnly: true },
];

function navIconClass(isActive: boolean, compact: boolean) {
  return [
    compact ? 'h-6 w-6' : 'h-5 w-5',
    'shrink-0 transition-[transform,color] duration-150',
    isActive ? 'text-white' : 'text-stone-500 group-hover:text-primary group-active:text-primary',
  ].join(' ');
}

/** Видимая обратная связь при обрыве сети и типичных ошибках API (многопользовательский режим). */
function ConnectivityBanner() {
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const onWarn = (e: Event) => {
      const ce = e as CustomEvent<{ message?: string }>;
      const msg = ce.detail?.message;
      if (typeof msg === 'string' && msg.trim()) {
        setApiMessage(msg.trim());
      }
    };
    const onClear = () => setApiMessage(null);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('app:api-warning', onWarn);
    window.addEventListener('app:api-clear-warning', onClear);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      window.removeEventListener('app:api-warning', onWarn);
      window.removeEventListener('app:api-clear-warning', onClear);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const showOffline = offline;
  const showApi = !showOffline && apiMessage != null;
  if (!showOffline && !showApi) {
    return null;
  }

  const text = showOffline
    ? 'Нет подключения к интернету. Данные могут быть неактуальны, действия не сохранятся.'
    : apiMessage!;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-start gap-3 border-b border-amber-200/90 bg-amber-50 px-4 py-3 text-[13px] font-medium leading-snug text-amber-950 md:px-5"
    >
      {showOffline ? (
        <LuWifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" strokeWidth={2} aria-hidden />
      ) : (
        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
      )}
      <p className="min-w-0 flex-1">{text}</p>
      {showApi ? (
        <button
          type="button"
          onClick={() => setApiMessage(null)}
          className="shrink-0 rounded-lg p-1 text-amber-900/80 hover:bg-amber-200/50"
          aria-label="Скрыть предупреждение"
        >
          <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function navClassName(isActive: boolean, compact = false): string {
  const base = compact
    ? 'group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-2 text-center font-semibold transition-[transform,background-color,box-shadow,color] duration-150 tap-highlight-transparent touch-manipulation active:scale-[0.94] sm:gap-1 sm:py-2.5'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors tap-highlight-transparent';
  const size = compact
    ? 'min-h-[52px] text-[10px] font-bold leading-tight tracking-tight sm:min-h-[54px] sm:text-[11px]'
    : '';
  const active = isActive
    ? compact
      ? 'bg-primary text-white shadow-md shadow-primary/30 ring-1 ring-primary/20'
      : 'bg-primary text-white shadow-md shadow-primary/25'
    : compact
      ? 'text-stone-600 hover:bg-stone-100/90 active:bg-stone-200/80'
      : 'text-stone-600 hover:bg-stone-100 shell:hover:bg-stone-50';
  return `${base} ${size} ${active}`.replace(/\s+/g, ' ').trim();
}

export function Layout() {
  useSyncServerRole();
  useRealtimeQuerySync();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  const appName = useBrandingStore((s) => s.appName);
  const description = useBrandingStore((s) => s.description);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);
  const logoScalePercent = useBrandingStore((s) => s.logoScalePercent);

  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  async function handleLogout() {
    if (!window.confirm('Завершить текущую сессию?')) {
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] flex-col bg-[var(--surface)] text-[var(--text)] [padding-left:env(safe-area-inset-left,0px)] [padding-right:env(safe-area-inset-right,0px)]">
      <ConnectivityBanner />
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col md:flex-row">
      {/* Планшет/десктоп: сайдбар с md (768px). На узких экранах — нижняя навигация. */}
      <aside className="hidden w-[min(100%,280px)] shrink-0 flex-col border-r border-stone-200/80 bg-[var(--surface-elevated)] shadow-[4px_0_16px_rgba(0,0,0,0.06)] md:flex md:w-[260px] lg:w-[272px]">
        <div className="flex flex-1 flex-col gap-1 p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/15 text-primary">
              {customLogoDataUrl ? (
                <img
                  src={customLogoDataUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: `scale(${logoScalePercent / 100})` }}
                />
              ) : (
                <LatinCrossIcon className="h-5 w-5" aria-hidden />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-base font-extrabold leading-tight text-stone-900">{appName}</p>
              <p className="mt-0.5 text-xs text-stone-500">{description}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1" data-web-nav="react-icons">
            {items.map((item) => {
              const Icon = item.Icon;
              return (
                <NavLink key={item.to} to={item.to} className={({ isActive }) => navClassName(isActive)}>
                  {({ isActive }) => (
                    <>
                      <Icon className={navIconClass(isActive, false)} strokeWidth={2} aria-hidden />
                      {item.label}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-stone-200/80 p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-[44px] w-full items-center rounded-xl px-4 py-3 text-left text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100"
          >
            Выйти
          </button>
        </div>
      </aside>

      {/* Main: отступ сверху под «чёлку», снизу под нижний бар + safe-area */}
      <main className="min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] [-webkit-overflow-scrolling:touch] md:pb-0 2xl:px-8 min-[1920px]:px-12">
        <Outlet />
      </main>

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 md:hidden"
        aria-label="Основная навигация"
      >
        <div className="pointer-events-auto mx-auto max-w-md px-3 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-2">
          <div className="flex items-stretch justify-between gap-1 rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)]/92 px-1 py-1.5 shadow-[var(--nav-pill-shadow)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--surface-elevated)]/88">
            {items.map((item) => {
              const Icon = item.Icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => navClassName(isActive, true)}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                      <span className="max-w-[5rem] truncate px-0.5 text-center max-[360px]:max-w-[4.25rem]">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      </nav>
      </div>
    </div>
  );
}
