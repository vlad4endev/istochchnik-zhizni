import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { LuChurch, LuMessageCircle, LuShield, LuUser, LuWifiOff, LuX } from 'react-icons/lu';

import { useAuthStore } from '../features/auth/authStore';
import { useBrandingStore } from '../features/branding/brandingStore';
import { useRealtimeQuerySync } from '../hooks/useRealtimeQuerySync';
import { useSyncServerRole } from '../hooks/useSyncServerRole';
import { IOSInstallBanner } from '../components/IOSInstallBanner';
import { AndroidInstallBanner } from '../components/AndroidInstallBanner';
import { UpdateNotification } from '../features/pwa';

type NavItem = {
  to: string;
  label: string;
  Icon: IconType;
  adminOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  /** Контурные Lucide — не путать с цветными эмодзи / Font Awesome «картинками». */
  { to: '/prayer', label: 'Молитва', Icon: LuChurch },
  { to: '/messenger', label: 'Чаты', Icon: LuMessageCircle },
  // { to: '/broadcast', label: 'Трансляции', Icon: LuTv },
  { to: '/profile', label: 'Профиль', Icon: LuUser },
  { to: '/admin', label: 'Админ', Icon: LuShield, adminOnly: true },
];

function navIconClass(isActive: boolean, compact: boolean) {
  return [
    compact ? 'h-6 w-6' : 'h-5 w-5',
    'shrink-0 transition-[transform,color] duration-150',
    isActive && compact ? 'text-primary' : isActive ? 'text-white' : 'text-stone-400 group-hover:text-primary',
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
    ? 'group relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 transition-[color,transform] duration-150 tap-highlight-transparent touch-manipulation active:scale-[0.92]'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors tap-highlight-transparent';
  const size = compact
    ? 'min-h-[48px]'
    : '';
  const active = isActive
    ? compact
      ? 'text-primary'
      : 'bg-primary text-white shadow-md shadow-primary/25'
    : compact
      ? 'text-stone-400 hover:text-stone-700'
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
    <div className="flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] flex-col overflow-x-clip bg-[var(--surface)] text-[var(--text)] [padding-left:env(safe-area-inset-left,0px)] [padding-right:env(safe-area-inset-right,0px)]">
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col box-border md:pl-[260px] lg:pl-[272px]">
      <div className="shrink-0">
        <ConnectivityBanner />
      </div>
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Планшет/десктоп: фиксированный сайдбар (не в потоке, не растягивается по ширине main). На узких — нижняя навигация. */}
      <aside className="hidden w-[260px] max-w-[260px] shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-stone-200/80 bg-[var(--surface-elevated)] shadow-[4px_0_16px_rgba(0,0,0,0.06)] md:fixed md:bottom-0 md:left-0 md:top-0 md:z-30 md:flex lg:w-[272px] lg:max-w-[272px] [padding-bottom:env(safe-area-inset-bottom,0px)] [padding-top:env(safe-area-inset-top,0px)]">
        <div className="flex min-h-0 flex-1 flex-col gap-1 p-6">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden xl:rounded-[0.9rem] rounded-xl bg-primary/10 text-primary p-1">
              {customLogoDataUrl ? (
                <img
                  src={customLogoDataUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  style={{ transform: `scale(${logoScalePercent / 100})` }}
                />
              ) : (
                <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain drop-shadow-sm" />
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

      {/* Main: отступ слева от сайдбара — на родителе (padding); снизу под нижний бар на мобильных */}
      <main className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-0 2xl:px-8 min-[1920px]:px-12">
        <Outlet />
      </main>

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200/70 bg-[var(--surface-elevated)]/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--surface-elevated)]/80 md:hidden"
        aria-label="Основная навигация"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-1 pt-1">
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
                    <span className="mt-1 truncate px-0.5 text-center text-[10px] font-semibold tracking-tight">
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
      </div>
      </div>
      <IOSInstallBanner />
      <AndroidInstallBanner />
      <UpdateNotification autoReload={true} />
    </div>
  );
}
