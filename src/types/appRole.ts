/** Роли приложения: member — пользователь; pastor — пастор; musician — студия; editor — модерация каталога; admin — полный доступ. */
export type AppRole = 'member' | 'pastor' | 'musician' | 'editor' | 'admin';

export function normalizeAppRole(raw: unknown): AppRole {
  if (typeof raw !== 'string') {
    return 'member';
  }
  const n = raw.trim().toLowerCase();
  if (n === 'admin') return 'admin';
  if (n === 'pastor') return 'pastor';
  if (n === 'editor') return 'editor';
  if (n === 'musician') return 'musician';
  return 'member';
}

const ROLE_RANK: Record<AppRole, number> = {
  member: 0,
  musician: 1,
  pastor: 2,
  editor: 3,
  admin: 4,
};

/** При слиянии дубликатов участников выбирается более «высокая» роль. */
export function mergeAppRoles(a: AppRole, b: AppRole): AppRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export function canAccessStudio(role: AppRole): boolean {
  return role === 'musician' || role === 'editor' || role === 'admin';
}

export function canModerateCatalog(role: AppRole): boolean {
  return role === 'editor' || role === 'admin';
}

/** Удаление песни из общего каталога — музыканты студии, редакторы и админ. */
export function canDeleteCatalogSong(role: AppRole): boolean {
  return role === 'musician' || role === 'editor' || role === 'admin';
}

export function isValidAppRoleString(value: unknown): value is AppRole {
  return (
    value === 'member' ||
    value === 'pastor' ||
    value === 'musician' ||
    value === 'editor' ||
    value === 'admin'
  );
}
