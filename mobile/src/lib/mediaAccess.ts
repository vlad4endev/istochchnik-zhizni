import type { AuthRole } from '../stores/authStore';
import { hasMediaMinistryDirection, isMediaManager } from './ministryRoleMatch';

function normalizeRoles(
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

function canModerateCatalog(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return normalizeRoles(role, roles).some((r) => {
    const v = r.toLowerCase();
    return v === 'musician' || v === 'editor' || v === 'admin' || v === 'pastor';
  });
}

export function canViewMediaSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateCatalog(role, roles) || hasMediaMinistryDirection(ministryDirection);
}

export function canManageMediaSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  const normalized = normalizeRoles(role, roles);
  if (normalized.some((r) => r.toLowerCase() === 'admin')) return true;
  return isMediaManager(ministryRole);
}

export function assignmentStatusLabel(status: string): string {
  if (status === 'confirmed') return 'Подтверждено';
  if (status === 'declined') return 'Отказался';
  if (status === 'pending') return 'Ожидает';
  return 'Назначен';
}
