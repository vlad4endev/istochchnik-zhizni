import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  LuTv,
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
import { PrefetchNavLink } from '../components/PrefetchNavLink';
import { ScrollRestoration } from '../components/ScrollRestoration';
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
import { apiBoolean } from '../lib/apiBoolean';
import { fetchActiveBroadcast } from '@/api/broadcast';
import { getActiveEvents, getCalendarDay, formatCalendarDayKey } from '@/features/calendar/api';
import { fetchSongs } from '@/features/songbook/api';
import { keys } from '@/lib/queryKeys';
import { useMe } from '@/hooks/useMe';
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
  adminOrMediaMinistryOnly?: boolean;
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
  { to: '/broadcast', label: 'Трансляция', Icon: LuTv, adminOrMediaMinistryOnly: true },
  { to: '/admin', label: 'Админ', Icon: LuShield, adminOnly: true },
  { to: '/analytics', label: 'Аналитика', Icon: LuChartColumnBig, adminOnly: true },
];

function normalizeMinistryDirection(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function navIconClass(isActive: boolean, compact: boolean) {
  return [
    compact ? 'h-5 w-5' : 'h-5 w-5',
    'shrink-0 transition-colors duration-200',
    isActive && compact ? 'bottom-nav-active-icon' : '',
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
    ? 'group relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-visible rounded-2xl px-0.5 py-1 transition-colors duration-200 tap-highlight-transparent touch-manipulation active:scale-[0.96]'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-200 tap-highlight-transparent';
  const size = compact
    ? 'min-h-[52px]'
    : '';
  const active = isActive
    ? compact
      ? 'bg-primary/10 text-primary nav-active-glow'
      : 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
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

/** Порядок пунктов для нижней панели (слева направо), затем перенос «не влезших» в «Ещё» по ширине. */
function buildOrderedMobileNavItems(visible: NavItem[]): NavItem[] {
  const ordered: NavItem[] = [];
  const push = (item: NavItem | undefined) => {
    if (item && !ordered.some((x) => x.to === item.to)) ordered.push(item);
  };
  const byTo = (path: string) => visible.find((i) => i.to === path);
  push(byTo('/dashboard'));
  push(byTo('/prayer'));
  push(byTo('/messenger'));
  const planner = byTo('/service-planner');
  const songbook = byTo('/songbook');
  if (planner) push(planner);
  else if (songbook) push(songbook);
  for (const def of NAV_ITEMS) {
    push(visible.find((v) => v.to === def.to));
  }
  return ordered;
}

/** Мин. ширина «ячейки» таба (иконка + подпись в одну строку); при нехватке места лишнее уходит в «Ещё». */
const MOBILE_TAB_MIN_WIDTH_PX = 62;
const MOBILE_MORE_BTN_WIDTH_PX = 54;

function splitMobileNavByWidth(
  containerWidth: number,
  ordered: NavItem[],
): { primary: NavItem[]; overflow: NavItem[] } {
  const n = ordered.length;
  if (n === 0) return { primary: [], overflow: [] };

  const w =
    !Number.isFinite(containerWidth) || containerWidth < 8 ? 280 : containerWidth;

  if (w < MOBILE_TAB_MIN_WIDTH_PX) {
    return { primary: ordered.slice(0, 1), overflow: ordered.slice(1) };
  }
  if (n * MOBILE_TAB_MIN_WIDTH_PX <= w) {
    return { primary: [...ordered], overflow: [] };
  }
  for (let k = n - 1; k >= 1; k -= 1) {
    if (k * MOBILE_TAB_MIN_WIDTH_PX + MOBILE_MORE_BTN_WIDTH_PX <= w) {
      return { primary: ordered.slice(0, k), overflow: ordered.slice(k) };
    }
  }
  return { primary: [ordered[0]], overflow: ordered.slice(1) };
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
  const menuId = useId();
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [open]);

  const isMoreTabActive = items.some((item) => mobileBottomRouteActive(pathname, item.to));

  return (
    <div className="relative flex min-w-0 flex-1 flex-col items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={navClassName(isMoreTabActive, true)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
      >
        <LuEllipsis className={navIconClass(isMoreTabActive, true)} strokeWidth={2} aria-hidden />
        <span className="mt-0.5 w-full min-w-0 truncate px-0.5 text-center text-[10px] font-medium leading-none tracking-tight">
          Ещё
        </span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[60]" aria-hidden={false}>
          <button
            type="button"
            aria-label="Закрыть дополнительные разделы"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Другие разделы"
            className="absolute bottom-0 left-0 right-0 max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-stone-200/90 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom,8px))] pt-2 shadow-2xl"
            onTouchStart={(e) => {
              touchStartYRef.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchEnd={(e) => {
              const startY = touchStartYRef.current;
              const endY = e.changedTouches[0]?.clientY ?? null;
              touchStartYRef.current = null;
              if (startY != null && endY != null && endY - startY > 50) {
                setOpen(false);
              }
            }}
          >
            <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-stone-300" aria-hidden />
            <div className="px-4 pb-2">
              <p className="text-sm font-bold text-stone-800">Разделы</p>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3">
              {items.map((item) => {
                const Icon = item.Icon;
                return (
                  <PrefetchNavLink
                    key={item.to}
                    role="menuitem"
                    to={item.to}
                    queryKey={NAV_PREFETCH_BY_PATH[item.to]?.queryKey}
                    queryFn={NAV_PREFETCH_BY_PATH[item.to]?.queryFn}
                    staleTime={NAV_PREFETCH_BY_PATH[item.to]?.staleTime}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      [
                        'relative flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center text-xs font-semibold transition-colors tap-highlight-transparent',
                        isActive ? 'bg-primary/10 text-primary' : 'text-stone-700 hover:bg-stone-50',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="relative inline-flex">
                          <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                          {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                            <span className="absolute -right-2.5 top-0 z-[5] inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white">
                              {formatNavBadgeCount(activityBadgeTotal)}
                            </span>
                          ) : null}
                        </span>
                        <span className="line-clamp-2">{item.label}</span>
                      </>
                    )}
                  </PrefetchNavLink>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const UNREAD_DELIVERIES_QK = ['notifications', 'unread-deliveries-count'] as const;
const NAV_PREFETCH_BY_PATH: Record<
  string,
  { queryKey: readonly unknown[]; queryFn: () => Promise<unknown>; staleTime?: number }
> = {
  '/songbook': { queryKey: keys.songs, queryFn: () => fetchSongs(), staleTime: 5 * 60_000 },
  '/dashboard': { queryKey: keys.broadcast, queryFn: fetchActiveBroadcast, staleTime: 5_000 },
  '/prayer': {
    queryKey: [...keys.prayer, 'today'],
    queryFn: () => getCalendarDay(formatCalendarDayKey(new Date())),
    staleTime: 60_000,
  },
  '/events': { queryKey: keys.events, queryFn: getActiveEvents, staleTime: 2 * 60_000 },
};
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
    queryKey: keys.sectionVisibility,
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
  const meQ = useMe(Boolean(token));
  const canSeeBroadcastNav = isAdmin || normalizeMinistryDirection(meQ.data?.ministry_direction) === 'медиа служения';
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  const profileUsername = useAuthStore((s) => s.username ?? '');
  const profileMemberId = useAuthStore((s) => s.memberId);
  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);
  const publicProfileSlug =
    profileUsername.trim() || (profileMemberId != null ? `member-${profileMemberId}` : '');
  const publicProfileTo = publicProfileSlug
    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
    : '/dashboard';

  const items = useMemo(() => {
    const navBase =
      registrationStatus === 'pending_review'
        ? NAV_ITEMS.filter((item) => item.to === '/dashboard')
        : registrationStatus === 'rejected'
          ? NAV_ITEMS.filter((item) => item.to === '/dashboard' || item.to === '/messenger')
          : NAV_ITEMS;
    return navBase.filter(
      (item) =>
        (!item.adminOnly || isAdmin) &&
        (!item.studioOnly || canAccessStudioRole(role)) &&
        (!item.adminOrMediaMinistryOnly || canSeeBroadcastNav) &&
        (!item.sectionId ||
          isAdmin ||
          canRoleAccessSection(sectionVisibilityQ.data, item.sectionId, role, roles)),
    );
  }, [
    registrationStatus,
    isAdmin,
    role,
    roles,
    sectionVisibilityQ.data,
    canSeeBroadcastNav,
  ]);
  const sidebarItems = items;
  const orderedMobileNavItems = useMemo(() => buildOrderedMobileNavItems(items), [items]);
  const navTabRowRef = useRef<HTMLDivElement>(null);
  const [mobileNavSplit, setMobileNavSplit] = useState<{ primary: NavItem[]; overflow: NavItem[] }>(() =>
    splitMobileNavByWidth(280, orderedMobileNavItems),
  );

  useLayoutEffect(() => {
    const el = navTabRowRef.current;
    const apply = (width: number) => {
      const next = splitMobileNavByWidth(width, orderedMobileNavItems);
      setMobileNavSplit((prev) => {
        if (
          prev.primary.length === next.primary.length &&
          prev.overflow.length === next.overflow.length &&
          prev.primary.every((p, i) => p.to === next.primary[i]?.to) &&
          prev.overflow.every((p, i) => p.to === next.overflow[i]?.to)
        ) {
          return prev;
        }
        return next;
      });
    };
    if (!el) {
      apply(280);
      return;
    }
    const run = () => apply(el.getBoundingClientRect().width || 280);
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [orderedMobileNavItems]);
  const isDashboardRoute =
    location.pathname === '/dashboard' || location.pathname === '/dashboard/';
  const showCoordinatorDashboardFab =
    isDashboardRoute &&
    meQ.isSuccess &&
    ((meQ.data?.app_role?.trim().toLowerCase() === 'admin') ||
      apiBoolean(meQ.data?.is_collection_coordinator));

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
    const sidebarWidth = navCollapsed ? '88px' : '272px';
    document.documentElement.style.setProperty('--sidebar-width', sidebarWidth);
    document.documentElement.dataset.sidebar = navCollapsed ? 'collapsed' : 'expanded';
  }, [navCollapsed]);

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
    <div className="flex min-h-0 w-full max-w-full flex-1 flex-col bg-[var(--surface)] text-[var(--text)]">
      <ScrollRestoration />
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
        ].join(' ')}
      >
      <div className="shrink-0">
        <ConnectivityBanner />
      </div>
      <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
      {/* Планшет/десктоп: фиксированный сайдбар (не в потоке, не растягивается по ширине main). На узких — нижняя навигация. */}
      <aside
        className={[
          'hidden shrink-0 flex-col overflow-hidden border-r border-stone-200/80 bg-[var(--surface-elevated)] shadow-[4px_0_16px_rgba(0,0,0,0.06)] lg:fixed lg:bottom-0 lg:left-0 lg:top-0 lg:z-30 lg:flex [padding-bottom:env(safe-area-inset-bottom,0px)] [padding-top:env(safe-area-inset-top,0px)]',
          navCollapsed ? 'w-[88px] max-w-[88px]' : 'w-[260px] max-w-[260px] xl:w-[272px] xl:max-w-[272px]',
        ].join(' ')}
      >
        <div className={navCollapsed ? 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-4' : 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-6'}>
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
                <PrefetchNavLink
                  key={item.to}
                  to={item.to}
                  queryKey={NAV_PREFETCH_BY_PATH[item.to]?.queryKey}
                  queryFn={NAV_PREFETCH_BY_PATH[item.to]?.queryFn}
                  staleTime={NAV_PREFETCH_BY_PATH[item.to]?.staleTime}
                  className={({ isActive }) =>
                    navCollapsed
                      ? [
                          'group flex min-h-[52px] w-full items-center justify-center rounded-2xl transition-colors',
                          isActive
                            ? 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
                            : 'text-stone-600 hover:bg-stone-100',
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
                </PrefetchNavLink>
              );
            })}
          </nav>
        </div>

        <div className="flex-shrink-0 border-t border-stone-200/80 p-4">
          {registrationStatus === 'active' ? (
            <>
              <NavLink
                to={publicProfileTo}
                className={({ isActive }) =>
                  [
                    'mb-2 flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors',
                    navCollapsed ? 'justify-center px-0' : 'px-4',
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
                      : 'text-stone-600 hover:bg-stone-100',
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
                to="/settings"
                end
                className={({ isActive }) =>
                  [
                    'mb-2 flex min-h-[44px] w-full items-center rounded-xl py-3 text-left text-sm font-semibold transition-colors',
                    navCollapsed ? 'justify-center px-0' : 'px-4',
                    isActive
                      ? 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
                      : 'text-stone-600 hover:bg-stone-100',
                  ].join(' ')
                }
                title={navCollapsed ? 'Настройки' : undefined}
                aria-label={navCollapsed ? 'Настройки' : undefined}
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
          'app-main-content flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip overflow-y-visible lg:pb-0 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--a11y-focus-ring,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
          'page-content',
          mainChromeVisible
            ? 'pb-[max(1rem,var(--app-bottom-nav-total-height))]'
            : 'pb-[max(1rem,env(safe-area-inset-bottom,16px))]',
        ].join(' ')}
      >
        <div key={location.pathname} className="page-enter min-h-0 flex flex-col flex-1">
          <Outlet />
        </div>
      </main>

      {isDashboardRoute ? <CoordinatorDashboardNoteFab /> : null}

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className={[
          'app-bottom-nav bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/95 pb-[var(--app-safe-bottom)] shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-white/90 lg:hidden transition-opacity duration-150 min-h-[var(--app-bottom-nav-total-height)]',
          mainChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        aria-label="Основная навигация"
        aria-hidden={!mainChromeVisible}
      >
        <div
          ref={navTabRowRef}
          className={[
            'flex w-full min-h-[var(--app-bottom-nav-bar-height)] min-w-0 items-stretch justify-evenly gap-0 px-0.5 pb-1 pt-1 sm:px-1',
            showCoordinatorDashboardFab ? 'max-lg:pr-[4.25rem]' : '',
          ].join(' ')}
        >
          {mobileNavSplit.primary.map((item) => {
            const Icon = item.Icon;
            return (
              <PrefetchNavLink
                key={item.to}
                to={item.to}
                queryKey={NAV_PREFETCH_BY_PATH[item.to]?.queryKey}
                queryFn={NAV_PREFETCH_BY_PATH[item.to]?.queryFn}
                staleTime={NAV_PREFETCH_BY_PATH[item.to]?.staleTime}
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
                    <span className="mt-0.5 w-full min-w-0 truncate px-0.5 text-center text-[10px] font-medium leading-none tracking-tight">
                      {item.label}
                    </span>
                  </>
                )}
              </PrefetchNavLink>
            );
          })}
          {mobileNavSplit.overflow.length > 0 ? (
            <MobileNavOverflow
              items={mobileNavSplit.overflow}
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
