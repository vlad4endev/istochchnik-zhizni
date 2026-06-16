import { canModerateSongCatalogSession } from '../auth/studioAccess';
import type { AuthRole } from '../auth/authStore';
import {
  hasMediaMinistryDirection,
  isMediaManager,
  memberHasMinistryRole,
  normalizeMinistryToken,
} from '../mediaSchedule/ministryRoleMatch';

export type ScheduleMinistryKey = 'media' | 'sunday';

export const SCHEDULE_MINISTRY_LABELS: Record<ScheduleMinistryKey, string> = {
  media: 'Медиа служение',
  sunday: 'Воскресное служение',
};

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

export function canViewSundaySchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return (
    canModerateSongCatalogSession(role, roles) ||
    hasAnyMinistryDirection(ministryDirection) ||
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
    canModerateSongCatalogSession(role, roles) ||
    hasAnyMinistryDirection(ministryDirection) ||
    canViewMediaSchedule(role, ministryDirection, roles) ||
    hasSundayMinistryRole(ministryRole)
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
  if (canViewSundaySchedule(role, ministryDirection, ministryRole, roles)) out.push('sunday');
  return out;
}

export function canManageMediaSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateSongCatalogSession(role, roles) || isMediaManager(ministryRole);
}

export function canManageSundaySchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  const elevated =
    canModerateSongCatalogSession(role, roles) ||
    (role ?? '').toLowerCase() === 'minister' ||
    (roles ?? []).some((r) => String(r ?? '').toLowerCase() === 'minister');
  return elevated || memberHasMinistryRole(ministryRole, 'Ведущий');
}

export function schedulePathForMinistry(key: ScheduleMinistryKey): string {
  return key === 'media' ? '/schedules/media' : '/schedules/sunday';
}
