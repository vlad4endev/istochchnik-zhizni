import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  LuChevronLeft,
  LuChevronRight,
  LuCalendarDays,
  LuChurch,
  LuDisc3,
  LuEllipsis,
  LuLayoutDashboard,
  LuMessageCircle,
  LuMic,
  LuMusic2,
  LuSettings,
  LuShield,
  LuChartColumnBig,
  LuUser,
  LuWifiOff,
  LuX,
} from 'react-icons/lu';

import { useAuthStore } from '../features/auth/authStore';
import { useBrandingStore } from '../features/branding/brandingStore';
import { useFCM } from '../hooks/useFCM';
import { useWebPushSync } from '../hooks/useWebPushSync';
import { useRealtimeQuerySync } from '../hooks/useRealtimeQuerySync';
import { useRealtimeWsConnection } from '../lib/realtimeWsClient';
import { useSyncServerRole } from '../hooks/useSyncServerRole';
import { IOSInstallBanner } from '../components/IOSInstallBanner';
import { AndroidInstallBanner } from '../components/AndroidInstallBanner';
import { UpdateNotification, useServiceWorkerUpdate, NotificationPrompt } from '../features/pwa';
import type { AppToastAction, AppToastKind } from '../lib/uiFeedback';
import { useChatStore } from '../features/messenger/chatStore';
import { MessengerWsProvider } from '../features/messenger/MessengerWsContext';
import { useBrowserNotificationScheduler } from '../features/notifications/useBrowserNotificationScheduler';
import { useProfileDraftStore } from '../features/profile/profileDraftStore';
import { canAccessStudioRole } from '../features/auth/studioAccess';
import { LAYOUT_MAIN_CHROME_EVENT } from './layoutChrome';
import { AppAvatar } from '../components/AppAvatar';
import { CoordinatorDashboardNoteFab } from '../features/dashboard/components/CoordinatorDashboardNoteFab';
import { apiClient } from '../lib/apiClient';
import {
  canRoleAccessSection,
  fetchSectionVisibilitySettingsPublic,
  type AppSectionId,
} from '../features/settings/sectionVisibilityApi';

type NavItem = {
  to: string;
  label: string;
  Icon: IconType;
  adminOnly?: boolean;
  studioOnly?: boolean;
  sectionId?: AppSectionId;
};

const NAV_ITEMS: NavItem[] = [
  /** Контурные Lucide — не путать с цветными эмодзи / Font Awesome «картинками». */
  { to: '/dashboard', label: 'Главная', Icon: LuLayoutDashboard, sectionId: 'dashboard' },
  { to: '/prayer', label: 'Молитва', Icon: LuChurch, sectionId: 'prayer' },
  { to: '/songbook', label: 'Песенник', Icon: LuMusic2, sectionId: 'songbook' },
  { to: '/service-planner', label: 'Планировщик', Icon: LuCalendarDays, sectionId: 'service_planner' },
  { to: '/studio', label: 'Студия', Icon: LuDisc3, studioOnly: true, sectionId: 'studio' },
  { to: '/sermons', label: 'Проповеди', Icon: LuMic, sectionId: 'sermons' },
  { to: '/messenger', label: 'Чаты', Icon: LuMessageCircle, sectionId: 'messenger' },
  // { to: '/broadcast', label: 'Трансляции', Icon: LuTv },
  { to: '/admin', label: 'Админ', Icon: LuShield, adminOnly: true },
  { to: '/admin/analytics', label: 'Аналитика', Icon: LuChartColumnBig, adminOnly: true },
];

function navIconClass(isActive: boolean, compact: boolean) {
  return [
    compact ? 'h-5 w-5' : 'h-5 w-5',
    'shrink-0 transition-colors duration-200',
    isActive && compact ? 'text-primary' : isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary',
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
  title?: string;
  avatarUrl?: string | null;
  avatarText?: string;
  action?: AppToastAction;
};

function normalizeToastKind(kind: unknown): AppToastKind {
  if (kind === 'success' || kind === 'info') return kind;
  return 'error';
}

function AppToastHost() {
  const [toasts, setToasts] = useState<UiToast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{
        message?: string;
        kind?: AppToastKind;
        title?: string;
        avatarUrl?: string | null;
        avatarText?: string;
        action?: AppToastAction;
      }>;
      const message = String(ce.detail?.message ?? '').trim();
      if (!message) return;
      const kind = normalizeToastKind(ce.detail?.kind);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const toast: UiToast = {
        id,
        message,
        kind,
        title: ce.detail?.title,
        avatarUrl: ce.detail?.avatarUrl,
        avatarText: ce.detail?.avatarText,
        action: ce.detail?.action,
      };
      setToasts((prev) => [...prev, toast].slice(-3));
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
        <button
          key={toast.id}
          type="button"
          role="status"
          aria-live="polite"
          onClick={() => {
            if (toast.action?.event) {
              window.dispatchEvent(
                new CustomEvent(toast.action.event, {
                  detail: toast.action.detail,
                }),
              );
            }
            setToasts((prev) => prev.filter((t) => t.id !== toast.id));
          }}
          className={[
            'pointer-events-auto w-full rounded-xl border px-3 py-2 text-left text-sm font-medium shadow-lg backdrop-blur transition hover:shadow-xl',
            toast.kind === 'error'
              ? 'border-rose-300/70 bg-rose-50/95 text-rose-900'
              : toast.kind === 'success'
                ? 'border-emerald-300/70 bg-emerald-50/95 text-emerald-900'
                : 'border-sky-300/70 bg-sky-50/95 text-sky-900',
          ].join(' ')}
        >
          <div className="flex items-start gap-3">
            <ToastAvatar avatarUrl={toast.avatarUrl} avatarText={toast.avatarText} />
            <div className="min-w-0 flex-1">
              {toast.title ? (
                <p className="truncate text-[13px] font-extrabold leading-tight">{toast.title}</p>
              ) : null}
              <p className="truncate text-[13px] leading-tight opacity-90">{toast.message}</p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ToastAvatar({
  avatarUrl,
  avatarText,
}: {
  avatarUrl?: string | null;
  avatarText?: string;
}) {
  return (
    <AppAvatar
      src={avatarUrl ?? null}
      fallback={<span>{(avatarText || '?').slice(0, 1).toUpperCase()}</span>}
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/60 text-xs font-extrabold text-stone-900"
      imgClassName="h-full w-full object-cover"
    />
  );
}

function formatNavBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function navClassName(isActive: boolean, compact = false): string {
  const base = compact
    ? 'group relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-visible rounded-2xl px-1.5 py-1.5 transition-colors duration-200 tap-highlight-transparent touch-manipulation active:scale-[0.96]'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-200 tap-highlight-transparent';
  const size = compact
    ? 'min-h-[52px]'
    : '';
  const active = isActive
    ? compact
      ? 'bg-primary/10 text-primary'
      : 'bg-primary text-white shadow-md shadow-primary/25'
    : compact
      ? 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
      : 'text-stone-600 hover:bg-stone-100 shell:hover:bg-stone-50';
  return `${base} ${size} ${active}`.replace(/\s+/g, ' ').trim();
}

/** Активный маршрут для нижней панели (в т.ч. вложенные пути). */
function mobileBottomRouteActive(pathname: string, to: string): boolean {
  if (to === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/dashboard/';
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Мобильный таббар: Главная, Молитва, Чаты, затем планировщик (если доступен) иначе песенник;
 * остальные разделы — в «Ещё».
 */
function splitMobileBottomNavItems(visible: NavItem[]): { primary: NavItem[]; overflow: NavItem[] } {
  const byTo = (path: string) => visible.find((i) => i.to === path);
  const primary: NavItem[] = [];
  const take = (path: string) => {
    const it = byTo(path);
    if (it) primary.push(it);
  };
  take('/dashboard');
  take('/prayer');
  take('/messenger');
  const planner = byTo('/service-planner');
  const songbook = byTo('/songbook');
  if (planner) primary.push(planner);
  else if (songbook) primary.push(songbook);
  const primaryTos = new Set(primary.map((p) => p.to));
  const overflow = visible.filter((i) => !primaryTos.has(i.to));
  return { primary, overflow };
}

function MobileNavOverflow({
  items,
  activityBadgeTotal,
  pathname,
}: {
  items: NavItem[];
  activityBadgeTotal: number;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      const el = wrapRef.current;
      if (!el?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isMoreTabActive = items.some((item) => mobileBottomRouteActive(pathname, item.to));

  return (
    <div ref={wrapRef} className="relative flex min-w-0 flex-1 flex-col items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={navClassName(isMoreTabActive, true)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <LuEllipsis className={navIconClass(isMoreTabActive, true)} strokeWidth={2} aria-hidden />
        <span className="mt-1 truncate px-0.5 text-center text-[11px] font-medium tracking-tight">Ещё</span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Другие разделы"
          className="absolute bottom-[calc(100%+0.35rem)] left-1/2 z-[60] w-[min(19rem,calc(100vw-1.25rem))] -translate-x-1/2 rounded-2xl border border-stone-200/90 bg-white/98 py-1.5 shadow-lg shadow-stone-900/10 backdrop-blur-md supports-[backdrop-filter]:bg-white/95"
        >
          {items.map((item) => {
            const Icon = item.Icon;
            return (
              <NavLink
                key={item.to}
                role="menuitem"
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  [
                    'flex min-h-[48px] items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition-colors tap-highlight-transparent',
                    isActive ? 'bg-primary/10 text-primary' : 'text-stone-700 hover:bg-stone-50',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative inline-flex shrink-0">
                      <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                      {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                        <span className="absolute -right-2.5 top-0 z-[5] inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white">
                          {formatNavBadgeCount(activityBadgeTotal)}
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const UNREAD_DELIVERIES_QK = ['notifications', 'unread-deliveries-count'] as const;

export function Layout() {
  useSyncServerRole();
  useFCM();
  useWebPushSync();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  useRealtimeQuerySync();
  useRealtimeWsConnection();
  useBrowserNotificationScheduler();
  const navigate = useNavigate();
  const location = useLocation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const refreshUnread = useChatStore((s) => s.refreshUnread);
  const unreadMessages = useChatStore((s) => s.totalUnread);
  const pendingDeliveriesQ = useQuery({
    queryKey: UNREAD_DELIVERIES_QK,
    queryFn: async () => {
      const { data } = await apiClient.get<{ count?: number }>('/api/notifications/unread-deliveries-count');
      const n = Number(data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: Boolean(token),
    staleTime: 12_000,
    refetchOnWindowFocus: true,
  });
  const pendingDeliveries = pendingDeliveriesQ.data ?? 0;
  const activityBadgeTotal = Math.min(99, unreadMessages + pendingDeliveries);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const sectionVisibilityQ = useQuery({
    queryKey: ['settings', 'sections', 'visibility'],
    queryFn: fetchSectionVisibilitySettingsPublic,
    staleTime: 30_000,
    enabled: Boolean(token),
  });
  const logout = useAuthStore((s) => s.logout);
  const updatePrompt = useServiceWorkerUpdate({ showPrompt: true });
  const [navCollapsed, setNavCollapsed] = useState(false);
  /** Скрытие сайдбара и нижнего таббара (режим чтения песен и т.п.). */
  const [mainChromeVisible, setMainChromeVisible] = useState(true);

  const appName = useBrandingStore((s) => s.appName);
  const description = useBrandingStore((s) => s.description);
  const customLogoDataUrl = useBrandingStore((s) => s.customLogoDataUrl);
  const logoScalePercent = useBrandingStore((s) => s.logoScalePercent);
  /** В сайдбаре не увеличиваем выше 100% — иначе transform вылезает из клетки и перекрывает соседей */
  const sidebarLogoScalePercent = Math.min(100, logoScalePercent);

  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  const profileUsername = useAuthStore((s) => s.username ?? '');
  const profileMemberId = useAuthStore((s) => s.memberId);
  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);
  const publicProfileSlug =
    profileUsername.trim() || (profileMemberId != null ? `member-${profileMemberId}` : '');
  const publicProfileTo = publicProfileSlug
    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
    : '/dashboard';

  const navBase =
    registrationStatus === 'pending_review'
      ? NAV_ITEMS.filter((item) => item.to === '/dashboard')
      : registrationStatus === 'rejected'
        ? NAV_ITEMS.filter((item) => item.to === '/dashboard' || item.to === '/messenger')
        : NAV_ITEMS;
  const items = navBase.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.studioOnly || canAccessStudioRole(role)) &&
      (!item.sectionId ||
        isAdmin ||
        canRoleAccessSection(sectionVisibilityQ.data, item.sectionId, role, roles)),
  );
  const sidebarItems = items;
  const { primary: mobilePrimaryItems, overflow: mobileOverflowItems } = useMemo(
    () => splitMobileBottomNavItems(items),
    [items],
  );
  const isDashboardRoute =
    location.pathname === '/dashboard' || location.pathname === '/dashboard/';

  const markAllDeliveriesOpened = useCallback(async () => {
    if (!token) return;
    try {
      await apiClient.post('/api/notifications/deliveries/open-all');
      void queryClient.invalidateQueries({ queryKey: UNREAD_DELIVERIES_QK });
      window.dispatchEvent(new CustomEvent('app:notification-deliveries-changed'));
    } catch {
      /* ignore */
    }
  }, [token, queryClient]);

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

  useEffect(() => {
    const onChrome = (e: Event) => {
      const ce = e as CustomEvent<{ visible?: boolean }>;
      setMainChromeVisible(ce.detail?.visible !== false);
    };
    window.addEventListener(LAYOUT_MAIN_CHROME_EVENT, onChrome);
    return () => {
      window.removeEventListener(LAYOUT_MAIN_CHROME_EVENT, onChrome);
    };
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

  useEffect(() => {
    const onOpenConversation = (e: Event) => {
      const ce = e as CustomEvent<{ conversationId?: string }>;
      const conversationId = String(ce.detail?.conversationId ?? '').trim();
      if (!conversationId) return;
      setActiveConversation(conversationId);
      navigate('/messenger');
    };
    window.addEventListener('app:open-conversation', onOpenConversation);
    return () => {
      window.removeEventListener('app:open-conversation', onOpenConversation);
    };
  }, [navigate, setActiveConversation]);

  /** Список чатов и totalUnread для бейджа в таббаре — не только после захода в «Чаты». */
  useEffect(() => {
    if (!token) return;
    void loadConversations();
  }, [token, loadConversations]);

  useEffect(() => {
    if (!token) return;
    void markAllDeliveriesOpened();
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshUnread();
      void markAllDeliveriesOpened();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [token, refreshUnread, markAllDeliveriesOpened]);

  useEffect(() => {
    const onDeliveries = () => {
      void queryClient.invalidateQueries({ queryKey: UNREAD_DELIVERIES_QK });
    };
    window.addEventListener('app:notification-deliveries-changed', onDeliveries);
    return () => window.removeEventListener('app:notification-deliveries-changed', onDeliveries);
  }, [queryClient]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const onServiceWorkerMessage = (e: MessageEvent) => {
      const payload = e.data as
        | { type?: string; url?: string; conversationId?: string | null }
        | undefined;
      if (!payload || payload.type !== 'push:navigate') {
        return;
      }

      const conversationId = String(payload.conversationId ?? '').trim();
      if (conversationId) {
        setActiveConversation(conversationId);
        navigate(`/messenger?conversationId=${encodeURIComponent(conversationId)}`);
        return;
      }

      const targetUrl = String(payload.url ?? '').trim();
      if (!targetUrl) return;

      try {
        const parsed = new URL(targetUrl, window.location.origin);
        const nextPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        if (nextPath) navigate(nextPath);
      } catch {
        /* ignore malformed URLs from SW */
      }
    };

    navigator.serviceWorker.addEventListener('message', onServiceWorkerMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [navigate, setActiveConversation]);

  /** Бейдж на иконке PWA: чаты + неоткрытые push/напоминания из журнала. */
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!token) {
      if (typeof nav.clearAppBadge === 'function') {
        void nav.clearAppBadge().catch(() => {});
      }
      return;
    }
    const total = activityBadgeTotal;
    if (typeof nav.setAppBadge === 'function') {
      if (total > 0) {
        void nav.setAppBadge(total).catch(() => {});
      } else if (typeof nav.clearAppBadge === 'function') {
        void nav.clearAppBadge().catch(() => {});
      }
    }
  }, [token, activityBadgeTotal]);

  return (
    <MessengerWsProvider>
    <div className="flex min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-x-clip bg-[var(--surface)] text-[var(--text)] [padding-left:env(safe-area-inset-left,0px)] [padding-right:env(safe-area-inset-right,0px)]">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          const mainEl = document.getElementById('main-content');
          if (!mainEl) return;
          e.preventDefault();
          mainEl.focus();
          const reduceMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
          mainEl.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
        }}
      >
        Перейти к содержимому
      </a>
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
                  style={{ transform: `scale(${sidebarLogoScalePercent / 100})` }}
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
                      <div className="relative">
                        <Icon className={navIconClass(isActive, navCollapsed)} strokeWidth={2} aria-hidden />
                        {item.to === '/messenger' && activityBadgeTotal > 0 && navCollapsed ? (
                          <span className="absolute -right-1 -top-1 z-[5] inline-flex min-h-[17px] min-w-[17px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white">
                            {formatNavBadgeCount(activityBadgeTotal)}
                          </span>
                        ) : null}
                      </div>
                      {!navCollapsed ? (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="truncate">{item.label}</span>
                          {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                            <span className={['inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-extrabold', isActive ? 'bg-white/90 text-primary' : 'bg-primary text-white'].join(' ')}>
                              {formatNavBadgeCount(activityBadgeTotal)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-stone-200/80 p-4">
          {registrationStatus === 'active' ? (
            <>
              <NavLink
                to={publicProfileTo}
                className={({ isActive }) =>
                  [
                    'mb-2 flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors',
                    navCollapsed ? 'justify-center px-0' : 'px-4',
                    isActive ? 'bg-primary text-white shadow-md shadow-primary/25' : 'text-stone-600 hover:bg-stone-100',
                  ].join(' ')
                }
                title={navCollapsed ? 'Моя страница' : undefined}
                aria-label={
                  navCollapsed
                    ? hasProfilePostDraft
                      ? 'Моя страница, есть несохранённый черновик поста'
                      : 'Моя страница'
                    : undefined
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="relative">
                      <LuUser className={navIconClass(isActive, navCollapsed)} strokeWidth={2} aria-hidden />
                      {hasProfilePostDraft && navCollapsed ? (
                        <span
                          className="absolute -right-0.5 -top-0.5 z-[5] h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    {!navCollapsed ? (
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="truncate">Моя страница</span>
                        {hasProfilePostDraft ? (
                          <span
                            className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-500"
                            title="Черновик поста"
                            aria-hidden
                          />
                        ) : null}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
              <NavLink
                to="/profile"
                end
                className={({ isActive }) =>
                  [
                    'mb-2 flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors',
                    navCollapsed ? 'justify-center px-0' : 'px-4',
                    isActive ? 'bg-primary text-white shadow-md shadow-primary/25' : 'text-stone-600 hover:bg-stone-100',
                  ].join(' ')
                }
                title={navCollapsed ? 'Настройки профиля' : undefined}
                aria-label={navCollapsed ? 'Настройки профиля' : undefined}
              >
                {({ isActive }) => (
                  <>
                    <LuSettings className={navIconClass(isActive, navCollapsed)} strokeWidth={2} aria-hidden />
                    {!navCollapsed ? 'Настройки' : null}
                  </>
                )}
              </NavLink>
            </>
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
      <main
        id="main-content"
        tabIndex={-1}
        className={[
          'app-main-content flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip md:pb-0 2xl:px-8 min-[1920px]:px-12 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--a11y-focus-ring,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
          mainChromeVisible
            ? 'pb-[max(7.5rem,calc(5.25rem+env(safe-area-inset-bottom,16px)))]'
            : 'pb-[max(1rem,env(safe-area-inset-bottom,16px))]',
        ].join(' ')}
      >
        <Outlet />
      </main>

      {isDashboardRoute ? <CoordinatorDashboardNoteFab /> : null}

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className={[
          'app-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/95 pb-[env(safe-area-inset-bottom,16px)] shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-white/90 md:hidden transition-transform duration-200',
          mainChromeVisible ? 'translate-y-0' : 'pointer-events-none translate-y-full opacity-0',
        ].join(' ')}
        aria-label="Основная навигация"
        aria-hidden={!mainChromeVisible}
      >
        <div className="mx-auto flex max-w-md items-stretch justify-center gap-0.5 px-1 pb-1 pt-1 sm:px-2">
          {mobilePrimaryItems.map((item) => {
            const Icon = item.Icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => navClassName(isActive, true)}
                aria-label={
                  item.to === '/messenger' && activityBadgeTotal > 0
                    ? `Чаты: непрочитанные сообщения и неоткрытые уведомления, всего: ${activityBadgeTotal > 99 ? 'более 99' : activityBadgeTotal}`
                    : undefined
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative z-10 inline-flex overflow-visible">
                      <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                      {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                        <span className="absolute -right-2.5 top-0 z-[5] inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white">
                          {formatNavBadgeCount(activityBadgeTotal)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 truncate px-0.5 text-center text-[11px] font-medium tracking-tight">
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
          {mobileOverflowItems.length > 0 ? (
            <MobileNavOverflow
              items={mobileOverflowItems}
              activityBadgeTotal={activityBadgeTotal}
              pathname={location.pathname}
            />
          ) : null}
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
      <NotificationPrompt />
    </div>
    </MessengerWsProvider>
  );
}
