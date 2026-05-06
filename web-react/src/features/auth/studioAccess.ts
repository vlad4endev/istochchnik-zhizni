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

export function canAccessStudioRole(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}

export function canAccessStudio(role: AuthRole | undefined, ministryDirection: unknown): boolean {
  return canAccessStudioRole(role) || hasMusicMinistryDirection(ministryDirection);
}

export function canModerateSongCatalog(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}

/** Удаление песни из каталога (студия / песенник): музыкант, редактор, админ. */
export function canDeleteSongFromCatalog(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
}
