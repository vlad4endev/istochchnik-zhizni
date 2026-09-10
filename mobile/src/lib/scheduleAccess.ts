import type { AuthRole } from '../stores/authStore';
import {
  hasMediaMinistryDirection,
  hasMusicMinistryDirection,
  hasSundayMinistryDirection,
  hasSundayMinistryRole,
  isMediaManager,
  isMusicLeader,
} from './ministryRoleMatch';

function normalizeRoles(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): string[] {
  const out: string[] = [];
  const push = (raw: AuthRole | string | null | undefined) => {
    const r = String(raw ?? '').trim().toLowerCase();
    if (!r) return;
    if (!out.includes(r)) out.push(r);
  };
  if (Array.isArray(roles) && roles.length > 0) {
    for (const item of roles) push(item);
  } else {
    push(role);
  }
  return out;
}

function hasRole(
  role: AuthRole | undefined,
  roles: Array<AuthRole | string | null | undefined> | undefined,
  match: string,
): boolean {
  return normalizeRoles(role, roles).includes(match);
}

function canModerateCatalog(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return normalizeRoles(role, roles).some((r) =>
    ['musician', 'editor', 'admin', 'pastor'].includes(r),
  );
}

export function canViewMusicSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
  ministryRole?: unknown,
): boolean {
  return (
    hasRole(role, roles, 'admin') ||
    hasRole(role, roles, 'musician') ||
    isMusicLeader(ministryRole) ||
    hasMusicMinistryDirection(ministryDirection)
  );
}

export function canManageMusicSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return (
    hasRole(role, roles, 'admin') ||
    hasRole(role, roles, 'musician') ||
    isMusicLeader(ministryRole)
  );
}

export function canViewSundaySchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return (
    hasRole(role, roles, 'pastor') ||
    hasRole(role, roles, 'admin') ||
    canModerateCatalog(role, roles) ||
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
    canModerateCatalog(role, roles) ||
    isMediaManager(ministryRole) ||
    hasMediaMinistryDirection(ministryDirection) ||
    canViewMusicSchedule(role, ministryDirection, roles, ministryRole) ||
    canViewSundaySchedule(role, ministryDirection, ministryRole, roles)
  );
}
