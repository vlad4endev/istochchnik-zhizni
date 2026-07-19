import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { IconType } from 'react-icons';
import {
  LuCalendarClock,
  LuChevronLeft,
  LuChevronRight,
  LuCalendarDays,
  LuChurch,
  LuDisc3,
  LuEllipsis,
  LuImages,
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
import { useWebPushSync } from '../hooks/useWebPushSync';
import { useRealtimeQuerySync } from '../hooks/useRealtimeQuerySync';
import { useRealtimeWsConnection } from '../lib/realtimeWsClient';
import { useSyncServerRole } from '../hooks/useSyncServerRole';
import { IOSInstallBanner } from '../components/IOSInstallBanner';
import { AndroidInstallBanner } from '../components/AndroidInstallBanner';
import { PermissionsRequestModal } from '../components/PermissionsRequestModal';
import { NotificationPrompt } from '../features/pwa';
import { PrefetchNavLink } from '../components/PrefetchNavLink';
import { ScrollRestoration } from '../components/ScrollRestoration';
import { isDraftPrivateConversationId, useChatStore } from '../features/messenger/chatStore';
import { MessengerWsProvider } from '../features/messenger/MessengerWsContext';
import { CallWindow } from '../features/calls/CallWindow';
import { IncomingCallToast } from '../features/calls/IncomingCallToast';
import { SermonPlaybackProvider } from '../features/resources/sermonPlayback/SermonPlaybackContext';
import { SermonPlayer } from '../features/resources/sermonPlayback/SermonPlayer';
import { useBrowserNotificationScheduler } from '../features/notifications/useBrowserNotificationScheduler';
import { useProfileDraftStore } from '../features/profile/profileDraftStore';
import { canAccessStudio } from '../features/auth/studioAccess';
import { canViewAnySchedule } from '../features/schedules/ministryScheduleAccess';
import { LAYOUT_MAIN_CHROME_EVENT } from './layoutChrome';
import { CoordinatorDashboardNoteFab } from '../features/dashboard/components/CoordinatorDashboardNoteFab';
import { apiClient } from '../lib/apiClient';
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
  mediaMinistryOnly?: boolean;
  scheduleAccessOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  /** Контурные Lucide — не путать с цветными эмодзи / Font Awesome «картинками». */
  { to: '/dashboard', label: 'Главная', Icon: LuLayoutDashboard, sectionId: 'dashboard' },
  { to: '/feed', label: 'Лента', Icon: LuImages, sectionId: 'feed' },
  { to: '/prayer', label: 'Молитва', Icon: LuChurch, sectionId: 'prayer' },
  { to: '/songbook', label: 'Песенник', Icon: LuMusic2, sectionId: 'songbook' },
  { to: '/service-planner', label: 'Служение', Icon: LuCalendarDays, sectionId: 'service_planner' },
  { to: '/schedules', label: 'Расписание', Icon: LuCalendarClock, scheduleAccessOnly: true },
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
    compact ? 'app-bottom-nav__glyph h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5' : 'h-5 w-5',
    'shrink-0 transition-colors duration-200',
    isActive && compact ? 'bottom-nav-active-icon' : '',
    isActive && compact ? 'text-primary' : isActive ? 'text-white' : 'text-gray-400 group-hover:text-primary',
  ].join(' ');
}

/** Только офлайн: компактная полоса без янтарного «алерта»; ошибки API — через `emitAppToast`. */
function ConnectivityBanner() {
  const [offline, setOffline] = useState(
    () => typeof navigator !== 'undefined' && !navigator.onLine,
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9998] flex items-center justify-center gap-2.5 border-t border-white/[0.07] bg-zinc-950/88 px-3 py-2.5 text-center backdrop-blur-xl supports-[backdrop-filter]:bg-zinc-950/72 sm:gap-3 sm:px-4 [padding-bottom:max(0.625rem,env(safe-area-inset-bottom,0px))]"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full motion-reduce:hidden animate-ping rounded-full bg-rose-400/45" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
      </span>
      <LuWifiOff className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
      <p className="min-w-0 max-w-[min(100%,40rem)] text-[13px] font-medium leading-snug text-zinc-100">
        Нет подключения — работаем офлайн
      </p>
    </div>
  );
}

function formatNavBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function navClassName(isActive: boolean, compact = false): string {
  const base = compact
    ? 'app-bottom-nav__tab group relative flex h-full w-full min-w-0 flex-col items-center justify-center overflow-visible transition-[transform,color] duration-200 ease-out tap-highlight-transparent touch-manipulation outline-none motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.97]'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-200 tap-highlight-transparent';
  const active = isActive
    ? compact
      ? 'is-active text-primary nav-active-glow'
      : 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
    : compact
      ? 'text-stone-500 hover:text-stone-700 active:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200 dark:active:text-stone-100'
      : 'text-stone-600 hover:bg-stone-100 shell:hover:bg-stone-50';
  return `${base} ${active}`.replace(/\s+/g, ' ').trim();
}

function mobileBottomTabIconClass(isActive: boolean): string {
  return [
    'app-bottom-nav__icon relative z-10 grid place-items-center overflow-visible rounded-full transition-colors duration-200',
    isActive ? 'is-active bg-primary/[0.12]' : 'group-active:bg-black/[0.05] dark:group-active:bg-white/[0.08]',
  ].join(' ');
}

function mobileBottomTabLabelClass(): string {
  return 'app-bottom-nav__label w-full min-w-0 text-center font-semibold tracking-tight text-inherit';
}

/** Активный маршрут для нижней панели (в т.ч. вложенные пути). */
function mobileBottomRouteActive(pathname: string, to: string): boolean {
  if (to === '/dashboard') {
    return pathname === '/dashboard' || pathname === '/dashboard/';
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Нижняя панель (мобильная / PWA): Главная → Молитва → Лента → Чаты → «Ещё». */
const MOBILE_BOTTOM_PINNED: readonly string[] = ['/dashboard', '/prayer', '/feed', '/messenger'];

function splitMobileNavTabs(visible: NavItem[]): { primary: NavItem[]; overflow: NavItem[] } {
  if (visible.length === 0) return { primary: [], overflow: [] };
  const byTo = (to: string) => visible.find((i) => i.to === to);
  const primary = MOBILE_BOTTOM_PINNED.map((to) => byTo(to)).filter((x): x is NavItem => Boolean(x));
  const pinned = new Set(MOBILE_BOTTOM_PINNED);
  const overflow = visible.filter((i) => !pinned.has(i.to));
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
    <div className="app-bottom-nav__cell relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={navClassName(isMoreTabActive, true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
      >
        <span className={mobileBottomTabIconClass(isMoreTabActive)}>
          <LuEllipsis className={navIconClass(isMoreTabActive, true)} strokeWidth={2} aria-hidden />
        </span>
        <span className={mobileBottomTabLabelClass()}>Ещё</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[60]" aria-hidden={false}>
          <button
            type="button"
            aria-label="Закрыть дополнительные разделы"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity dark:bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div
            id={menuId}
            role="region"
            aria-label="Дополнительные разделы"
            className="app-mobile-nav-more-sheet absolute bottom-0 left-0 right-0 mx-auto w-full max-h-[min(78dvh,640px)] max-w-lg overflow-hidden rounded-t-[1.35rem] border border-stone-200/90 border-b-0 bg-[color-mix(in_srgb,var(--surface-elevated)_96%,transparent)] shadow-[0_-12px_48px_rgba(28,25,23,0.14)] backdrop-blur-xl dark:border-stone-700/80 dark:bg-[color-mix(in_srgb,var(--surface-elevated)_94%,transparent)] dark:shadow-[0_-12px_48px_rgba(0,0,0,0.45)]"
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
            <div className="flex max-h-[min(78dvh,640px)] flex-col">
              <div className="shrink-0 pt-2">
                <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-300/90 dark:bg-stone-600" aria-hidden />
                <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-0.5">
                  <p className="text-[15px] font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                    Все разделы
                  </p>
                  <button
                    type="button"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-500 transition-colors hover:bg-black/[0.06] hover:text-stone-800 active:scale-95 dark:text-stone-400 dark:hover:bg-white/10 dark:hover:text-stone-100"
                    aria-label="Закрыть"
                    onClick={() => setOpen(false)}
                  >
                    <LuX className="h-5 w-5" strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,12px))] pt-1 sm:px-4 [webkit-overflow-scrolling:touch]">
                <div className="app-mobile-sections-grid mx-auto grid w-full max-w-full grid-cols-2 gap-2.5 min-[360px]:grid-cols-3 min-[440px]:grid-cols-4 sm:gap-3">
                  {items.map((item) => {
                    const Icon = item.Icon;
                    return (
                      <PrefetchNavLink
                        key={item.to}
                        to={item.to}
                        queryKey={NAV_PREFETCH_BY_PATH[item.to]?.queryKey}
                        queryFn={NAV_PREFETCH_BY_PATH[item.to]?.queryFn}
                        staleTime={NAV_PREFETCH_BY_PATH[item.to]?.staleTime}
                        onClick={() => setOpen(false)}
                        className={({ isActive }) =>
                          [
                            'relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border px-1.5 py-2.5 text-center transition-[transform,background-color,border-color,color] duration-150 tap-highlight-transparent motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-[0.97]',
                            isActive
                              ? 'border-primary/25 bg-primary/12 text-primary shadow-sm dark:border-primary/35 dark:bg-primary/20'
                              : 'border-stone-200/70 bg-stone-50/90 text-stone-800 hover:border-stone-300/90 hover:bg-white dark:border-stone-700/80 dark:bg-stone-800/55 dark:text-stone-100 dark:hover:border-stone-600 dark:hover:bg-stone-800/90',
                          ].join(' ')
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span className="relative inline-flex shrink-0">
                              <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                              {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                                <span className="absolute -right-2.5 top-0 z-[5] inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white dark:ring-stone-900">
                                  {formatNavBadgeCount(activityBadgeTotal)}
                                </span>
                              ) : null}
                            </span>
                            <span className="line-clamp-2 w-full max-w-[5.5rem] text-[11px] font-semibold leading-snug sm:max-w-none sm:text-xs">
                              {item.label}
                            </span>
                          </>
                        )}
                      </PrefetchNavLink>
                    );
                  })}
                </div>
              </div>
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
  useWebPushSync();
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  useRealtimeQuerySync();
  useRealtimeWsConnection();
  useBrowserNotificationScheduler();
  const navigate = useNavigate();
  const location = useLocation();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const setCurrentMemberId = useChatStore((s) => s.setCurrentMemberId);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const refreshUnread = useChatStore((s) => s.refreshUnread);
  const unreadMessages = useChatStore((s) => s.totalUnread);
  const authMemberId = useAuthStore((s) => s.memberId);
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
  const canSeeScheduleNav = canViewAnySchedule(
    role,
    meQ.data?.ministry_direction,
    meQ.data?.ministry_role,
    roles,
  );
  const canSeeStudioNav = canAccessStudio(role, meQ.data?.ministry_direction, roles);
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  const profileUsername = useAuthStore((s) => s.username ?? '');
  const profileMemberId = useAuthStore((s) => s.memberId);
  const hasProfilePostDraft = useProfileDraftStore((s) => s.hasActivePostDraft);
  const publicProfileSlug =
    profileUsername.trim() || (profileMemberId != null ? `member-${profileMemberId}` : '');
  const publicProfileTo = publicProfileSlug
    ? `/profile/${encodeURIComponent(publicProfileSlug)}`
    : '/dashboard';

  const isParishionerGuest = (role ?? 'member').toLowerCase() === 'parishioner';

  const items = useMemo(() => {
    if (isParishionerGuest) {
      const parishionerPaths = new Set(['/dashboard', '/events', '/messenger', '/sermons']);
      return NAV_ITEMS.filter(
        (item) =>
          parishionerPaths.has(item.to) &&
          (!item.sectionId ||
            isAdmin ||
            canRoleAccessSection(sectionVisibilityQ.data, item.sectionId, role, roles)),
      );
    }
    const navBase =
      registrationStatus === 'pending_review'
        ? NAV_ITEMS.filter((item) => item.to === '/dashboard')
        : registrationStatus === 'rejected'
          ? NAV_ITEMS.filter((item) => item.to === '/dashboard' || item.to === '/messenger')
          : NAV_ITEMS;
    return navBase.filter(
      (item) =>
        (!item.adminOnly || isAdmin) &&
        (!item.studioOnly || canSeeStudioNav) &&
        (!item.adminOrMediaMinistryOnly || canSeeBroadcastNav) &&
        (!item.scheduleAccessOnly || canSeeScheduleNav) &&
        (!item.sectionId ||
          isAdmin ||
          canRoleAccessSection(sectionVisibilityQ.data, item.sectionId, role, roles)),
    );
  }, [
    isParishionerGuest,
    registrationStatus,
    isAdmin,
    role,
    roles,
    sectionVisibilityQ.data,
    canSeeBroadcastNav,
    canSeeScheduleNav,
    canSeeStudioNav,
  ]);
  const sidebarItems = items;
  /** На телефоне «Настройки» нет в NAV_ITEMS — добавляем в лист «Ещё», как в подвале сайдбара на lg+. */
  const mobileNavSplit = useMemo(() => {
    const split = splitMobileNavTabs(items);
    if (registrationStatus !== 'active') return split;
    if (split.overflow.some((i) => i.to === '/settings')) return split;
    return {
      primary: split.primary,
      overflow: [
        ...split.overflow,
        { to: '/settings', label: 'Настройки', Icon: LuSettings } satisfies NavItem,
      ],
    };
  }, [items, registrationStatus]);
  const isDashboardRoute =
    location.pathname === '/dashboard' || location.pathname === '/dashboard/';

  const markAllDeliveriesOpened = useCallback(async () => {
    if (!token) return;
    if (registrationStatus !== 'active') return;
    try {
      await apiClient.post('/api/notifications/deliveries/open-all');
      void queryClient.invalidateQueries({ queryKey: UNREAD_DELIVERIES_QK });
      window.dispatchEvent(new CustomEvent('app:notification-deliveries-changed'));
    } catch {
      /* ignore */
    }
  }, [token, registrationStatus, queryClient]);

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
      // draft:* открывает MessengerPage через ensurePrivateDraft (peer ещё может быть неизвестен).
      if (isDraftPrivateConversationId(conversationId)) {
        navigate(`/messenger?conversationId=${encodeURIComponent(conversationId)}`);
        return;
      }
      setActiveConversation(conversationId);
      navigate(`/messenger?conversationId=${encodeURIComponent(conversationId)}`);
    };
    window.addEventListener('app:open-conversation', onOpenConversation);
    return () => {
      window.removeEventListener('app:open-conversation', onOpenConversation);
    };
  }, [navigate, setActiveConversation]);

  /** До WS `ready`: привязать кэш мессенджера к memberId из auth (не guest-снимок). */
  useEffect(() => {
    if (!token) return;
    if (typeof authMemberId === 'number' && authMemberId > 0) {
      setCurrentMemberId(authMemberId);
    }
  }, [token, authMemberId, setCurrentMemberId]);

  /** Список чатов и totalUnread для бейджа в таббаре — не только после захода в «Чаты». */
  useEffect(() => {
    if (!token) return;
    void loadConversations();
  }, [token, loadConversations]);

  useEffect(() => {
    if (!token) return;
    if (registrationStatus !== 'active') return;
    void markAllDeliveriesOpened();
    const onResume = () => {
      void refreshUnread();
      void markAllDeliveriesOpened();
    };
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      onResume();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('app:background-resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('app:background-resume', onResume);
    };
  }, [token, registrationStatus, refreshUnread, markAllDeliveriesOpened]);

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
        // Не вызываем setActiveConversation для draft:* — иначе залипает чужой/пустой peer.
        if (!isDraftPrivateConversationId(conversationId)) {
          setActiveConversation(conversationId);
        }
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

  useEffect(() => {
    const onNativePushNavigate = (e: Event) => {
      const ce = e as CustomEvent<{ url?: string; conversationId?: string | null }>;
      const payload = ce.detail ?? {};
      const conversationId = String(payload.conversationId ?? '').trim();
      if (conversationId) {
        if (!isDraftPrivateConversationId(conversationId)) {
          setActiveConversation(conversationId);
        }
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
        /* ignore malformed native payload URLs */
      }
    };

    window.addEventListener('app:native-push-navigate', onNativePushNavigate as EventListener);
    return () => {
      window.removeEventListener('app:native-push-navigate', onNativePushNavigate as EventListener);
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
    <SermonPlaybackProvider>
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
      <ConnectivityBanner />
      <div className="relative flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
      {/* Десктоп (lg+): фиксированный сайдбар. До lg — нижняя навигация (как мобильная сетка дашборда). */}
      <aside
        className={[
          /* lg+: сайдбар; до lg — только нижний таббар */
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
          'app-main-content flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-clip max-lg:overflow-y-auto lg:overflow-y-visible outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--a11y-focus-ring,var(--primary))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]',
          'page-content',
          'max-lg:pb-[var(--app-bottom-nav-total-height)] lg:pb-0',
        ].join(' ')}
      >
        <div key={location.pathname} className="page-enter flex min-h-0 w-full max-w-full flex-1 flex-col">
          <Outlet />
        </div>
      </main>

      {isDashboardRoute ? <CoordinatorDashboardNoteFab /> : null}

      {/* Телефон: нижняя навигация (иконка + подпись, как в нативных приложениях) */}
      <nav
        className={[
          'app-bottom-nav bottom-nav fixed bottom-0 left-0 right-0 z-[100] isolate flex w-full min-w-0 max-w-full flex-col border-t border-black/[0.07] bg-[color-mix(in_srgb,var(--surface-elevated)_94%,transparent)] pb-[max(0px,env(safe-area-inset-bottom,0px))] shadow-[0_-1px_0_rgba(0,0,0,0.05),0_-10px_40px_rgba(28,25,23,0.08)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--surface-elevated)_88%,transparent)] lg:hidden transition-opacity duration-150 ease-out dark:border-white/[0.08] dark:shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-12px_40px_rgba(0,0,0,0.35)] [padding-left:max(0px,env(safe-area-inset-left,0px))] [padding-right:max(0px,env(safe-area-inset-right,0px))]',
          mainChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        aria-label="Основная навигация"
        aria-hidden={!mainChromeVisible}
        style={
          {
            '--app-bottom-nav-cols': String(
              Math.max(
                1,
                mobileNavSplit.primary.length + (mobileNavSplit.overflow.length > 0 ? 1 : 0),
              ),
            ),
          } as CSSProperties
        }
      >
        <div className="app-bottom-nav__row">
          {mobileNavSplit.primary.map((item) => {
            const Icon = item.Icon;
            return (
              <div key={item.to} className="app-bottom-nav__cell relative min-w-0">
                <PrefetchNavLink
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
                      <span className={mobileBottomTabIconClass(isActive)}>
                        <Icon className={navIconClass(isActive, true)} strokeWidth={2} aria-hidden />
                        {item.to === '/messenger' && activityBadgeTotal > 0 ? (
                          <span className="app-bottom-nav__badge absolute -right-1 -top-0.5 z-[5] inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-extrabold leading-none text-white shadow-sm ring-2 ring-white dark:ring-[color-mix(in_srgb,var(--surface-elevated)_92%,transparent)]">
                            {formatNavBadgeCount(activityBadgeTotal)}
                          </span>
                        ) : null}
                      </span>
                      <span className={mobileBottomTabLabelClass()}>{item.label}</span>
                    </>
                  )}
                </PrefetchNavLink>
              </div>
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
      <NotificationPrompt />
      <PermissionsRequestModal />
      <IncomingCallToast />
      <CallWindow />
      <SermonPlayer />
    </div>
    </SermonPlaybackProvider>
    </MessengerWsProvider>
  );
}
