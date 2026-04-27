import type { AuthRole } from './authStore';

export function canAccessStudioRole(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'musician' || r === 'editor' || r === 'admin';
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
