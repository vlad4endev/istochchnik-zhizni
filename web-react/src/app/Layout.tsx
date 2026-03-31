import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { IconType } from 'react-icons';
import { LuChevronLeft, LuChevronRight, LuChurch, LuMessageCircle, LuShield, LuUser, LuWifiOff, LuX } from 'react-icons/lu';

import { useAuthStore } from '../features/auth/authStore';
import { useBrandingStore } from '../features/branding/brandingStore';
import { useRealtimeQuerySync } from '../hooks/useRealtimeQuerySync';
import { useSyncServerRole } from '../hooks/useSyncServerRole';
import { IOSInstallBanner } from '../components/IOSInstallBanner';
import { AndroidInstallBanner } from '../components/AndroidInstallBanner';
import { UpdateNotification, useServiceWorkerUpdate } from '../features/pwa';
import type { AppToastKind } from '../lib/uiFeedback';

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

type UiToast = {
  id: number;
  message: string;
  kind: AppToastKind;
};

function normalizeToastKind(kind: unknown): AppToastKind {
  if (kind === 'success' || kind === 'info') return kind;
  return 'error';
}

function AppToastHost() {
  const [toasts, setToasts] = useState<UiToast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{ message?: string; kind?: AppToastKind }>;
      const message = String(ce.detail?.message ?? '').trim();
      if (!message) return;
      const kind = normalizeToastKind(ce.detail?.kind);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setToasts((prev) => [...prev, { id, message, kind }].slice(-3));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    };
    window.addEventListener('app:toast', onToast);
    return () => {
      window.removeEventListener('app:toast', onToast);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-end gap-2 md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className={[
            'w-full rounded-xl border px-3 py-2 text-sm font-medium shadow-lg backdrop-blur',
            toast.kind === 'error'
              ? 'border-rose-300/70 bg-rose-50/95 text-rose-900'
              : toast.kind === 'success'
                ? 'border-emerald-300/70 bg-emerald-50/95 text-emerald-900'
                : 'border-sky-300/70 bg-sky-50/95 text-sky-900',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ))}
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
  const updatePrompt = useServiceWorkerUpdate({ showPrompt: true });
  const [navCollapsed, setNavCollapsed] = useState(false);

  const appName = useBrandingStore((s) => s.appName);
  const description = useBrandingStore((s) => s.description);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);
  const logoScalePercent = useBrandingStore((s) => s.logoScalePercent);

  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const profileItem = items.find((i) => i.to === '/profile') ?? null;
  const sidebarItems = profileItem ? items.filter((i) => i.to !== '/profile') : items;
  const mobileItems = profileItem
    ? [...items.filter((i) => i.to !== '/profile'), profileItem]
    : items;

  async function handleLogout() {
    if (!window.confirm('Завершить текущую сессию?')) {
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  }

  useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem('app_nav_collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);

  function toggleNavCollapsed() {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('app_nav_collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] flex-col overflow-x-clip bg-[var(--surface)] text-[var(--text)] [padding-left:env(safe-area-inset-left,0px)] [padding-right:env(safe-area-inset-right,0px)]">
      <div
        className={[
          'flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col box-border',
          navCollapsed ? 'md:pl-[88px]' : 'md:pl-[260px] lg:pl-[272px]',
        ].join(' ')}
      >
      <div className="shrink-0">
        <ConnectivityBanner />
      </div>
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Планшет/десктоп: фиксированный сайдбар (не в потоке, не растягивается по ширине main). На узких — нижняя навигация. */}
      <aside
        className={[
          'hidden shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-stone-200/80 bg-[var(--surface-elevated)] shadow-[4px_0_16px_rgba(0,0,0,0.06)] md:fixed md:bottom-0 md:left-0 md:top-0 md:z-30 md:flex [padding-bottom:env(safe-area-inset-bottom,0px)] [padding-top:env(safe-area-inset-top,0px)]',
          navCollapsed ? 'w-[88px] max-w-[88px]' : 'w-[260px] max-w-[260px] lg:w-[272px] lg:max-w-[272px]',
        ].join(' ')}
      >
        <div className={navCollapsed ? 'flex min-h-0 flex-1 flex-col gap-1 p-4' : 'flex min-h-0 flex-1 flex-col gap-1 p-6'}>
          <div className={navCollapsed ? 'mb-4 flex items-center justify-center' : 'mb-6 flex items-start gap-3'}>
            <div className={navCollapsed ? 'flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 p-1 text-primary' : 'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary p-1 xl:rounded-[0.9rem]'}>
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
            {!navCollapsed ? (
              <div className="min-w-0">
                <p className="text-base font-extrabold leading-tight text-stone-900">{appName}</p>
                <p className="mt-0.5 text-xs text-stone-500">{description}</p>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={toggleNavCollapsed}
            className={[
              'mb-3 flex min-h-[44px] items-center justify-center rounded-2xl border border-stone-200/80 bg-white/60 text-stone-600 transition hover:bg-stone-50 hover:text-primary',
              navCollapsed ? 'w-full' : 'w-full justify-between px-3',
            ].join(' ')}
            aria-label={navCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            title={navCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {navCollapsed ? (
              <LuChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden />
            ) : (
              <>
                <span className="text-xs font-extrabold uppercase tracking-[0.14em]">Меню</span>
                <LuChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </>
            )}
          </button>

          <nav className={navCollapsed ? 'flex flex-col gap-2' : 'flex flex-col gap-1'} data-web-nav="react-icons">
            {sidebarItems.map((item) => {
              const Icon = item.Icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    navCollapsed
                      ? [
                          'group flex min-h-[52px] w-full items-center justify-center rounded-2xl transition-colors',
                          isActive ? 'bg-primary text-white shadow-md shadow-primary/25' : 'text-stone-600 hover:bg-stone-100',
                        ].join(' ')
                      : navClassName(isActive)
                  }
                  title={navCollapsed ? item.label : undefined}
                  aria-label={navCollapsed ? item.label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={navIconClass(isActive, navCollapsed)} strokeWidth={2} aria-hidden />
                      {!navCollapsed ? item.label : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-stone-200/80 p-4">
          {profileItem ? (
            <NavLink
              to={profileItem.to}
              className={({ isActive }) =>
                [
                  'mb-2 flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors',
                  navCollapsed ? 'justify-center px-0' : 'px-4',
                  isActive ? 'bg-primary text-white shadow-md shadow-primary/25' : 'text-stone-600 hover:bg-stone-100',
                ].join(' ')
              }
              title={navCollapsed ? profileItem.label : undefined}
              aria-label={navCollapsed ? profileItem.label : undefined}
            >
              {({ isActive }) => (
                <>
                  <profileItem.Icon className={navIconClass(isActive, navCollapsed)} strokeWidth={2} aria-hidden />
                  {!navCollapsed ? profileItem.label : null}
                </>
              )}
            </NavLink>
          ) : null}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={[
              'flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold text-stone-600 transition-colors hover:bg-stone-100',
              navCollapsed ? 'justify-center px-0' : 'px-4',
            ].join(' ')}
          >
            {navCollapsed ? '⎋' : 'Выйти'}
          </button>
        </div>
      </aside>

      {/* Main: отступ слева от сайдбара — на родителе (padding); снизу под нижний бар на мобильных */}
      <main className="app-main-content flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))] md:pb-0 2xl:px-8 min-[1920px]:px-12">
        <Outlet />
      </main>

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className="app-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-stone-200/70 bg-[var(--surface-elevated)]/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--surface-elevated)]/80 md:hidden"
        aria-label="Основная навигация"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pb-1 pt-1">
          {mobileItems.map((item) => {
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
      <AppToastHost />
      {updatePrompt.show ? (
        <UpdateNotification onUpdate={updatePrompt.onUpdate} onDismiss={() => updatePrompt.onDismiss?.()} />
      ) : null}
    </div>
  );
}
