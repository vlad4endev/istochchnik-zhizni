import type { AuthRole } from './authStore';

export function canAccessStudioRole(role: AuthRole | undefined, direction?: string | null): boolean {
  const r = (role ?? 'member').toLowerCase();
  
  // Админ имеет доступ ко всем разделам.
  if (r === 'admin') return true;
  
  // Для остальных ролей (редактор, музыкант и т.д.) требуется направление Музыкальное служение
  if (direction !== 'Музыкальное служение') return false;

  return r === 'musician' || r === 'editor';
}

/**
 * Показываем меню «Песенник» и «Студия» тем, у кого:
 * – роль admin, ИЛИ
 * – направление «Музыкальное служение», ИЛИ
 * – роль «музыкант» (musician)
 */
export function canAccessMusicMenu(role: AuthRole | undefined, direction?: string | null): boolean {
  const r = (role ?? 'member').toLowerCase();
  if (r === 'admin') return true;
  if (r === 'musician') return true;
  return direction === 'Музыкальное служение';
}

export function canModerateSongCatalog(role: AuthRole | undefined): boolean {
  const r = (role ?? 'member').toLowerCase();
  return r === 'editor' || r === 'admin';
}
