/** Роли приложения: member — пользователь; minister — служитель; pastor — пастор; musician — студия; editor — модерация каталога; admin — полный доступ. */
export type AppRole = 'member' | 'minister' | 'pastor' | 'musician' | 'editor' | 'admin';

export function normalizeAppRole(raw: unknown): AppRole {
  if (typeof raw !== 'string') {
    return 'member';
  }
  const n = raw.trim().toLowerCase();
  if (n === 'admin') return 'admin';
  if (n === 'minister') return 'minister';
  if (n === 'pastor') return 'pastor';
  if (n === 'editor') return 'editor';
  if (n === 'musician') return 'musician';
  return 'member';
}

const ROLE_RANK: Record<AppRole, number> = {
  member: 0,
  minister: 1,
  pastor: 2,
  musician: 3,
  editor: 4,
  admin: 5,
};

/** При слиянии дубликатов участников выбирается более «высокая» роль. */
export function mergeAppRoles(a: AppRole, b: AppRole): AppRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export function normalizeAppRoles(rawRoles: unknown, fallbackRole?: unknown): AppRole[] {
  const out: AppRole[] = [];
  const pushRole = (value: unknown) => {
    const role = normalizeAppRole(value);
    if (!out.includes(role)) out.push(role);
  };
  if (Array.isArray(rawRoles)) {
    for (const item of rawRoles) {
      pushRole(item);
    }
  } else if (typeof rawRoles === 'string' && rawRoles.trim()) {
    for (const part of rawRoles.split(/[;,]/)) {
      pushRole(part);
    }
  }
  if (out.length === 0) {
    pushRole(fallbackRole);
  }
  if (out.length === 0) {
    out.push('member');
  }
  return out;
}

export function pickPrimaryAppRole(roles: AppRole[]): AppRole {
  let current: AppRole = 'member';
  for (const role of roles) {
    current = mergeAppRoles(current, role);
  }
  return current;
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
    value === 'minister' ||
    value === 'pastor' ||
    value === 'musician' ||
    value === 'editor' ||
    value === 'admin'
  );
}
