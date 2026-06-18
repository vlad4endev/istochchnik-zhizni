import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { IconType } from 'react-icons';
import {
  LuCalendarClock,
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
  LuCircleAlert,
  LuCheck,
  LuInfo,
} from 'react-icons/lu';

import { isAppAdministratorSession, useAuthStore } from '../features/auth/authStore';
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
import type { AppToastAction, AppToastKind } from '../lib/uiFeedback';
import { useChatStore } from '../features/messenger/chatStore';
import { MessengerWsProvider } from '../features/messenger/MessengerWsContext';
import { CallWindow } from '../features/calls/CallWindow';
import { IncomingCallToast } from '../features/calls/IncomingCallToast';
import { useBrowserNotificationScheduler } from '../features/notifications/useBrowserNotificationScheduler';
import { useProfileDraftStore } from '../features/profile/profileDraftStore';
import { canAccessStudio } from '../features/auth/studioAccess';
import { canViewAnySchedule } from '../features/schedules/ministryScheduleAccess';
import { LAYOUT_MAIN_CHROME_EVENT } from './layoutChrome';
import { AppAvatar } from '../components/AppAvatar';
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
    compact ? 'h-5 w-5' : 'h-5 w-5',
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

type UiToast = {
  id: number;
  message: string;
  kind: AppToastKind;
  title?: string;
  avatarUrl?: string | null;
  avatarText?: string;
  action?: AppToastAction;
  durationMs: number;
};

function normalizeToastKind(kind: unknown): AppToastKind {
  if (kind === 'success' || kind === 'info') return kind;
  return 'error';
}

function AppToastHost() {
  const [active, setActive] = useState<UiToast | null>(null);
  const queueRef = useRef<UiToast[]>([]);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef<UiToast | null>(null);

  const presentNextFromQueue = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
    if (next) {
      timerRef.current = window.setTimeout(() => {
        presentNextFromQueue();
      }, next.durationMs);
    }
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{
        message?: string;
        kind?: AppToastKind;
        title?: string;
        avatarUrl?: string | null;
        avatarText?: string;
        action?: AppToastAction;
        durationMs?: number;
        adminOnly?: boolean;
      }>;
      if (ce.detail?.adminOnly === true && !isAppAdministratorSession()) {
        return;
      }
      const message = String(ce.detail?.message ?? '').trim();
      if (!message) return;
      const kind = normalizeToastKind(ce.detail?.kind);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const durationRaw = Number(ce.detail?.durationMs);
      const durationMs =
        Number.isFinite(durationRaw) && durationRaw >= 1500 && durationRaw <= 60_000 ? durationRaw : 4200;
      const toast: UiToast = {
        id,
        message,
        kind,
        title: ce.detail?.title,
        avatarUrl: ce.detail?.avatarUrl,
        avatarText: ce.detail?.avatarText,
        action: ce.detail?.action,
        durationMs,
      };
      queueRef.current.push(toast);
      if (!activeRef.current) {
        presentNextFromQueue();
      }
    };
    window.addEventListener('app:toast', onToast);
    return () => {
      window.removeEventListener('app:toast', onToast);
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [presentNextFromQueue]);

  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        presentNextFromQueue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [active, presentNextFromQueue]);

  if (!active) return null;

  const kindRing =
    active.kind === 'error'
      ? 'ring-rose-400/35'
      : active.kind === 'success'
        ? 'ring-emerald-400/35'
        : 'ring-sky-400/35';

  const KindIcon =
    active.kind === 'error' ? LuCircleAlert : active.kind === 'success' ? LuCheck : LuInfo;

  const onConfirm = () => {
    if (active.action?.event) {
      window.dispatchEvent(
        new CustomEvent(active.action.event, {
          detail: active.action.detail,
        }),
      );
    }
    presentNextFromQueue();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" role="presentation">
      <button
        type="button"
        aria-label="Закрыть уведомление"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity"
        onClick={presentNextFromQueue}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        aria-labelledby={`app-toast-${active.id}-title`}
        aria-describedby={`app-toast-${active.id}-msg`}
        className={[
          'relative z-[71] w-full max-w-[min(100%,20rem)] rounded-2xl px-5 py-5 shadow-2xl ring-1 ring-inset backdrop-blur-xl',
          'bg-zinc-900/88 text-zinc-100 ring-white/12',
          kindRing,
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <KindIcon
            className={[
              'h-10 w-10 shrink-0 opacity-95',
              active.kind === 'error'
                ? 'text-rose-300'
                : active.kind === 'success'
                  ? 'text-emerald-300'
                  : 'text-sky-300',
            ].join(' ')}
            strokeWidth={1.75}
            aria-hidden
          />
          {(active.avatarUrl || active.avatarText) && (
            <ToastAvatarModal avatarUrl={active.avatarUrl} avatarText={active.avatarText} />
          )}
          {active.title ? (
            <p id={`app-toast-${active.id}-title`} className="text-[15px] font-semibold leading-snug text-white">
              {active.title}
            </p>
          ) : (
            <span id={`app-toast-${active.id}-title`} className="sr-only">
              Уведомление
            </span>
          )}
          <p
            id={`app-toast-${active.id}-msg`}
            className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-100/95"
          >
            {active.message}
          </p>
          <button
            type="button"
            onClick={onConfirm}
            className="mt-1 w-full rounded-xl bg-white/14 py-3 text-[15px] font-semibold text-white transition hover:bg-white/22 active:bg-white/18"
          >
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastAvatarModal({
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
      className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-sm font-extrabold text-white"
      imgClassName="h-full w-full object-cover"
    />
  );
}

function formatNavBadgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function navClassName(isActive: boolean, compact = false): string {
  const base = compact
    ? 'group relative flex min-w-0 flex-1 flex-col items-center justify-center overflow-visible rounded-[14px] px-0.5 py-1.5 transition-[transform,background-color,color] duration-200 ease-out tap-highlight-transparent touch-manipulation outline-none motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-[0.96]'
    : 'group flex w-full items-center justify-start gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-colors duration-200 tap-highlight-transparent';
  const size = compact ? 'min-h-[50px]' : '';
  const active = isActive
    ? compact
      ? 'bg-primary/[0.11] text-primary shadow-[inset_0_0_0_1px_rgba(125,54,64,0.14)] nav-active-glow active:bg-primary/[0.15]'
      : 'bg-primary text-white shadow-md shadow-primary/25 nav-active-glow'
    : compact
      ? 'text-stone-500 hover:bg-black/[0.04] hover:text-stone-700 active:bg-black/[0.06] dark:text-stone-400 dark:hover:bg-white/[0.06] dark:hover:text-stone-200 dark:active:bg-white/[0.08]'
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

/** Нижняя панель (мобильная / PWA): фиксированно Главная → Молитва → Чаты, всё остальное — в «Ещё». */
const MOBILE_BOTTOM_PINNED: readonly string[] = ['/dashboard', '/prayer', '/messenger'];

function splitMobileNavFourTabs(visible: NavItem[]): { primary: NavItem[]; overflow: NavItem[] } {
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
    <div className="relative flex min-w-0 flex-1 flex-col items-stretch">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={navClassName(isMoreTabActive, true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={menuId}
      >
        <LuEllipsis className={navIconClass(isMoreTabActive, true)} strokeWidth={2} aria-hidden />
        <span className="mt-0.5 w-full min-w-0 px-0.5 text-center text-[11px] font-semibold leading-[1.15] tracking-tight text-inherit line-clamp-1">
          Ещё
        </span>
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
    const split = splitMobileNavFourTabs(items);
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

  useEffect(() => {
    const onNativePushNavigate = (e: Event) => {
      const ce = e as CustomEvent<{ url?: string; conversationId?: string | null }>;
      const payload = ce.detail ?? {};
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
          'app-bottom-nav bottom-nav fixed bottom-0 left-0 right-0 z-[100] isolate flex w-full min-w-0 max-w-full flex-col border-t border-black/[0.07] bg-[color-mix(in_srgb,var(--surface-elevated)_94%,transparent)] pb-[max(0px,env(safe-area-inset-bottom,0px))] shadow-[0_-1px_0_rgba(0,0,0,0.05),0_-10px_40px_rgba(28,25,23,0.08)] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--surface-elevated)_88%,transparent)] lg:hidden transition-opacity duration-150 ease-out dark:border-white/[0.08] dark:shadow-[0_-1px_0_rgba(255,255,255,0.06),0_-12px_40px_rgba(0,0,0,0.35)] [padding-left:max(0.5rem,env(safe-area-inset-left,0px))] [padding-right:max(0.5rem,env(safe-area-inset-right,0px))]',
          mainChromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        aria-label="Основная навигация"
        aria-hidden={!mainChromeVisible}
      >
        <div className="flex w-full min-h-[var(--app-bottom-nav-bar-height)] min-w-0 items-stretch justify-between gap-1 px-2 pb-0 pt-1.5 sm:px-3">
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
                    <span className="mt-0.5 w-full min-w-0 px-0.5 text-center text-[11px] font-semibold leading-[1.15] tracking-tight text-inherit line-clamp-1">
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
      <NotificationPrompt />
      <PermissionsRequestModal />
      <IncomingCallToast />
      <CallWindow />
    </div>
    </MessengerWsProvider>
  );
}
