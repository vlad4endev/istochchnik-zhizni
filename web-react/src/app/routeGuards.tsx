import { type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../features/auth/authStore';
import { canAccessStudio, canModerateSongCatalogSession } from '../features/auth/studioAccess';
import { canViewMediaSchedule } from '../features/mediaSchedule/mediaAccess';
import { canViewAnySchedule, canViewSundaySchedule } from '../features/schedules/ministryScheduleAccess';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import {
  canRoleAccessSection,
  fetchSectionVisibilitySettingsPublic,
  type AppSectionId,
} from '../features/settings/sectionVisibilityApi';
import { getAppVariant } from '../lib/appVariant';
import { useAuthSessionReady } from '../hooks/useAuthSessionReady';
import { useMe } from '@/hooks/useMe';

export const LOGIN_PATH = '/login';

/** Основной сайт (главный домен), если чаты на отдельном origin — задаётся при сборке только messenger-web. */
export function resolveMainAppOrigin(): string {
  const raw =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_MAIN_APP_ORIGIN as string | undefined)
      : undefined;
  return (raw ?? '').trim().replace(/\/+$/, '');
}

function isChatStandaloneApp(): boolean {
  return String(import.meta.env?.VITE_CHAT_APP ?? '').trim() === 'true';
}

export function getPendingRegistrationFallbackPath(): string {
  return getAppVariant() === 'full' ? '/dashboard' : '/pending-review';
}

function getMessengerPendingFallbackPath(): string {
  const ext = isChatStandaloneApp() ? resolveMainAppOrigin() : '';
  const suffix = getAppVariant() === 'full' ? '/dashboard' : '/pending-review';
  if (ext) {
    return `${ext}${suffix}`;
  }
  return getAppVariant() === 'full' ? '/dashboard' : '/pending-review';
}

export function getStudioRoleDeniedPath(): string {
  return getAppVariant() === 'studio' ? '/login' : '/dashboard';
}

export function RouteFallback(): ReactNode {
  return (
    <div className="flex min-h-[50dvh] w-full flex-1 items-center justify-center bg-[var(--surface)] text-stone-500">
      <div className="w-full max-w-md space-y-2.5 px-4">
        <SkeletonBox width="34%" height="14px" />
        <SkeletonBox width="100%" height="44px" radius="12px" />
        <SkeletonBox width="82%" height="14px" />
      </div>
    </div>
  );
}

export function HydrateSplash(): ReactNode {
  return (
    <div
      className="flex min-h-screen items-center justify-center text-stone-500"
      style={{ background: '#f4f1ed' }}
    >
      <div className="w-full max-w-sm space-y-2.5 px-4">
        <SkeletonBox width="36%" height="14px" />
        <SkeletonBox width="100%" height="44px" radius="12px" />
      </div>
    </div>
  );
}

export function RequireAuth() {
  const ready = useAuthSessionReady();
  const token = useAuthStore((s) => s.token);
  const location = useLocation();

  if (!ready) {
    return <HydrateSplash />;
  }

  if (!token) {
    const fromPath = `${location.pathname}${location.search}${location.hash}`;
    const encodedFrom =
      fromPath && fromPath !== '/' ? `?from=${encodeURIComponent(fromPath)}` : '';
    const ext = isChatStandaloneApp() ? resolveMainAppOrigin() : '';
    if (ext) {
      const next = `${ext}/login`;
      window.location.replace(`${next}${encodedFrom}`);
      /** Не оставлять пустой кадр до смены документа (на iOS PWA заметен как «белый экран»). */
      return <HydrateSplash />;
    }
    return <Navigate to={`${LOGIN_PATH}${encodedFrom}`} replace state={{ from: fromPath }} />;
  }

  return <Outlet />;
}

/** Режим прихожанина: главная, чаты, проповеди и профиль доступны; остальные экраны — редирект с прямой ссылки. */
export function BlockParishionerGuest({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if ((role ?? '').toLowerCase() === 'parishioner') {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  if (!isAdmin) {
    return <Navigate to="/prayer" replace />;
  }
  return <>{children}</>;
}

/** Полный доступ к разделам приложения только после одобрения заявки (active). */
export function RequireFullMember({ children }: { children: ReactNode }) {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  if (registrationStatus !== 'active') {
    return <Navigate to={getPendingRegistrationFallbackPath()} replace />;
  }
  return <>{children}</>;
}

/** Чаты недоступны, пока заявка на регистрацию не одобрена (отклонённым — для поддержки). */
export function RequireMessengerAccess({ children }: { children: ReactNode }) {
  const registrationStatus = useAuthStore((s) => s.registrationStatus ?? 'active');
  if (registrationStatus === 'pending_review') {
    const path = getMessengerPendingFallbackPath();
    if (path.startsWith('http://') || path.startsWith('https://')) {
      window.location.replace(path);
      return null;
    }
    return <Navigate to={path} replace />;
  }
  return <>{children}</>;
}

export function RequireStudioAccess({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  if (meQ.isLoading) return <RouteFallback />;
  if (!canAccessStudio(role, meQ.data?.ministry_direction, roles)) {
    return <Navigate to={getStudioRoleDeniedPath()} replace />;
  }
  return <>{children}</>;
}

export function RequireMediaMinistryAccess({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  if (meQ.isLoading) return <RouteFallback />;
  if (!canViewMediaSchedule(role, meQ.data?.ministry_direction, roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireSundayScheduleAccess({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  if (meQ.isLoading) return <RouteFallback />;
  if (!canViewSundaySchedule(role, meQ.data?.ministry_direction, meQ.data?.ministry_role, roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireAnyScheduleAccess({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));
  if (meQ.isLoading) return <RouteFallback />;
  if (!canViewAnySchedule(role, meQ.data?.ministry_direction, meQ.data?.ministry_role, roles)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RequireCatalogModerator({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const location = useLocation();
  if (!canModerateSongCatalogSession(role, roles)) {
    const fallback = location.pathname.startsWith('/studio/') ? '/studio/catalog' : '/songbook';
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}

export function RequireSectionAccess({
  sectionId,
  children,
  fallbackPath = '/dashboard',
}: {
  sectionId: AppSectionId;
  children: ReactNode;
  fallbackPath?: string;
}) {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const isAdmin = (role ?? 'member').toLowerCase() === 'admin';
  const settingsQ = useQuery({
    queryKey: ['settings', 'sections', 'visibility'],
    queryFn: fetchSectionVisibilitySettingsPublic,
    staleTime: 30_000,
  });
  if (isAdmin) return <>{children}</>;
  if (settingsQ.isLoading) return <RouteFallback />;
  const canAccess = canRoleAccessSection(settingsQ.data, sectionId, role, roles);
  if (!canAccess) {
    return <Navigate to={fallbackPath} replace />;
  }
  return <>{children}</>;
}
