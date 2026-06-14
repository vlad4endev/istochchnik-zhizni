import type { AuthRole } from './authStore';

function normalizeMinistryDirection(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/ё/g, 'е');
}

export function hasMusicMinistryDirection(ministryDirection: unknown): boolean {
  const v = normalizeMinistryDirection(ministryDirection);
  if (!v) return false;
  const target = normalizeMinistryDirection('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryDirection(s))
    .some((s) => s === target || s.includes(target));
}

function normalizeStudioRoles(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): AuthRole[] {
  const out: AuthRole[] = [];
  const push = (raw: AuthRole | string | null | undefined) => {
    const r = String(raw ?? 'member').trim().toLowerCase();
    if (!r) return;
    if (!out.includes(r as AuthRole)) out.push(r as AuthRole);
  };
  if (Array.isArray(roles) && roles.length > 0) {
    for (const item of roles) push(item);
  } else {
    push(role);
  }
  if (out.length === 0) push('member');
  return out;
}

export function canAccessStudioRole(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}

export function canAccessStudioRoles(roles: AuthRole[]): boolean {
  return roles.some((role) => canAccessStudioRole(role));
}

export function canAccessStudio(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canAccessStudioRoles(normalizeStudioRoles(role, roles)) || hasMusicMinistryDirection(ministryDirection);
}

export function canModerateSongCatalog(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}

export function canModerateSongCatalogRoles(roles: AuthRole[]): boolean {
  return roles.some((role) => canModerateSongCatalog(role));
}

export function canModerateSongCatalogSession(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateSongCatalogRoles(normalizeStudioRoles(role, roles));
}

/** Удаление песни из каталога (студия / песенник): музыкант, редактор, админ. */
export function canDeleteSongFromCatalog(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}

export function canDeleteSongFromCatalogSession(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return normalizeStudioRoles(role, roles).some((item) => canDeleteSongFromCatalog(item));
}
