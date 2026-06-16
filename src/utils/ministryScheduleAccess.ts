import { normalizeMinistryToken, parseMinistryRoles, memberHasMinistryRole, hasMediaMinistryDirection, hasMusicMinistryDirection } from './ministryRoleMatch';

export type ScheduleMinistryKey = 'media' | 'music' | 'sunday';

export const SCHEDULE_MINISTRY_LABELS: Record<ScheduleMinistryKey, string> = {
  media: 'Медиа служение',
  music: 'Музыкальное служение',
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
    return (
      s.includes('воскресн') ||
      s.includes('богослужен') ||
      s.includes('ведущ')
    );
  });
}

export function hasSundayMinistryRole(ministryRole: unknown): boolean {
  return (
    memberHasMinistryRole(ministryRole, 'Ведущий') ||
    memberHasMinistryRole(ministryRole, 'Проповедник')
  );
}

export function canViewMusicSchedule(input: {
  ministry_direction?: unknown;
}): boolean {
  return hasMusicMinistryDirection(input.ministry_direction);
}

export function listAccessibleScheduleMinistries(input: {
  ministry_direction?: unknown;
  ministry_role?: unknown;
  canModerateCatalog?: boolean;
  app_role?: unknown;
  app_roles?: unknown;
}): ScheduleMinistryKey[] {
  const out: ScheduleMinistryKey[] = [];
  if (
    input.canModerateCatalog ||
    hasMediaMinistryDirection(input.ministry_direction) ||
    memberHasMinistryRole(input.ministry_role, 'Медиа менеджер')
  ) {
    out.push('media');
  }
  if (canViewMusicSchedule({ ministry_direction: input.ministry_direction })) {
    out.push('music');
  }
  if (
    canViewSundaySchedule({
      ministry_direction: input.ministry_direction,
      ministry_role: input.ministry_role,
      canModerateCatalog: input.canModerateCatalog,
      app_role: input.app_role,
      app_roles: input.app_roles,
    })
  ) {
    out.push('sunday');
  }
  return out;
}

export function canViewSundaySchedule(input: {
  ministry_direction?: unknown;
  ministry_role?: unknown;
  canModerateCatalog?: boolean;
  app_role?: unknown;
  app_roles?: unknown;
}): boolean {
  if (input.canModerateCatalog) return true;
  if (canManageSundaySchedule({ app_role: input.app_role, app_roles: input.app_roles })) return true;
  if (hasSundayMinistryDirection(input.ministry_direction)) return true;
  if (hasSundayMinistryRole(input.ministry_role)) return true;
  return false;
}

export function canViewAnySchedule(input: {
  ministry_direction?: unknown;
  ministry_role?: unknown;
  canModerateCatalog?: boolean;
  app_role?: unknown;
  app_roles?: unknown;
}): boolean {
  if (input.canModerateCatalog) return true;
  if (
    hasMediaMinistryDirection(input.ministry_direction) ||
    memberHasMinistryRole(input.ministry_role, 'Медиа менеджер') ||
    hasMusicMinistryDirection(input.ministry_direction) ||
    canManageSundaySchedule({ app_role: input.app_role, app_roles: input.app_roles }) ||
    hasSundayMinistryDirection(input.ministry_direction) ||
    hasSundayMinistryRole(input.ministry_role)
  ) {
    return true;
  }
  return false;
}

export function canManageSundaySchedule(input: {
  app_role?: unknown;
  app_roles?: unknown;
}): boolean {
  const primary = String(input.app_role ?? '').trim().toLowerCase();
  if (primary === 'pastor' || primary === 'admin') return true;
  const extra = Array.isArray(input.app_roles) ? input.app_roles : [];
  return extra.some((r) => {
    const v = String(r ?? '').trim().toLowerCase();
    return v === 'pastor' || v === 'admin';
  });
}

export function canManageMediaSchedule(input: {
  app_role?: unknown;
  app_roles?: unknown;
  ministry_role?: unknown;
}): boolean {
  const primary = String(input.app_role ?? '').trim().toLowerCase();
  if (primary === 'admin') return true;
  const extra = Array.isArray(input.app_roles) ? input.app_roles : [];
  if (extra.some((r) => String(r ?? '').trim().toLowerCase() === 'admin')) return true;
  return memberHasMinistryRole(input.ministry_role, 'Медиа менеджер');
}

export function canManageMusicSchedule(input: {
  ministry_role?: unknown;
}): boolean {
  return memberHasMinistryRole(input.ministry_role, 'Музыкальный лидер');
}
