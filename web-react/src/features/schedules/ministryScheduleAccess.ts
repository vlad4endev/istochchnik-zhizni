import { canModerateSongCatalogSession } from '../auth/studioAccess';
import type { AuthRole } from '../auth/authStore';
import {
  hasMediaMinistryDirection,
  isMediaManager,
  memberHasMinistryRole,
  normalizeMinistryToken,
} from '../mediaSchedule/ministryRoleMatch';
import { hasMusicMinistryDirection, isMusicManager } from '../musicSchedule/ministryRoleMatch';

export type ScheduleMinistryKey = 'media' | 'music' | 'sunday';

export const SCHEDULE_MINISTRY_LABELS: Record<ScheduleMinistryKey, string> = {
  media: 'Медиа служение',
  music: 'Музыкальное служение',
  sunday: 'Воскресное служение',
};

function normalizeAppRoleToken(role: unknown): string {
  return String(role ?? '').trim().toLowerCase();
}

export function isAdminAppRole(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  if (normalizeAppRoleToken(role) === 'admin') return true;
  return (roles ?? []).some((r) => normalizeAppRoleToken(r) === 'admin');
}

export function isPastorAppRole(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  if (normalizeAppRoleToken(role) === 'pastor') return true;
  return (roles ?? []).some((r) => normalizeAppRoleToken(r) === 'pastor');
}

export function parseMinistryDirections(ministryDirection: unknown): string[] {
  return Array.from(
    new Set(
      String(ministryDirection ?? '')
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  );
}

export function hasAnyMinistryDirection(ministryDirection: unknown): boolean {
  return parseMinistryDirections(ministryDirection).length > 0;
}

export function hasSundayMinistryDirection(ministryDirection: unknown): boolean {
  const parts = parseMinistryDirections(ministryDirection).map((s) => normalizeMinistryToken(s));
  return parts.some((s) => {
    if (!s) return false;
    return s.includes('воскресн') || s.includes('богослужен') || s.includes('ведущ');
  });
}

export function hasSundayMinistryRole(ministryRole: unknown): boolean {
  return (
    memberHasMinistryRole(ministryRole, 'Ведущий') ||
    memberHasMinistryRole(ministryRole, 'Проповедник')
  );
}

export function canViewMediaSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateSongCatalogSession(role, roles) || hasMediaMinistryDirection(ministryDirection);
}

export function canViewMusicSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateSongCatalogSession(role, roles) || hasMusicMinistryDirection(ministryDirection);
}

export function canViewSundaySchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return (
    isPastorAppRole(role, roles) ||
    isAdminAppRole(role, roles) ||
    canModerateSongCatalogSession(role, roles) ||
    hasSundayMinistryDirection(ministryDirection) ||
    hasSundayMinistryRole(ministryRole)
  );
}

export function canViewAnySchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return (
    canViewMediaSchedule(role, ministryDirection, roles) ||
    canViewMusicSchedule(role, ministryDirection, roles) ||
    canViewSundaySchedule(role, ministryDirection, ministryRole, roles)
  );
}

export function listAccessibleScheduleMinistries(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): ScheduleMinistryKey[] {
  const out: ScheduleMinistryKey[] = [];
  if (canViewMediaSchedule(role, ministryDirection, roles)) out.push('media');
  if (canViewMusicSchedule(role, ministryDirection, roles)) out.push('music');
  if (canViewSundaySchedule(role, ministryDirection, ministryRole, roles)) out.push('sunday');
  return out;
}

export function canManageMediaSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMediaManager(ministryRole);
}

export function canManageMusicSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMusicManager(ministryRole);
}

export function canManageSundaySchedule(
  role: AuthRole | undefined,
  _ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isPastorAppRole(role, roles) || isAdminAppRole(role, roles);
}

export function schedulePathForMinistry(key: ScheduleMinistryKey): string {
  if (key === 'media') return '/schedules/media';
  if (key === 'music') return '/schedules/music';
  return '/schedules/sunday';
}
