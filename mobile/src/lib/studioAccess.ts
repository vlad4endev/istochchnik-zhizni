import type { AuthRole } from '../stores/authStore';
import { normalizeMinistryToken } from './ministryRoleMatch';

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

export function hasMusicMinistryDirection(ministryDirection: unknown): boolean {
  const v = normalizeMinistryToken(ministryDirection);
  if (!v) return false;
  const target = normalizeMinistryToken('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryToken(s))
    .some((s) => s === target || s.includes(target));
}

export function canAccessStudio(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  const normalized = normalizeStudioRoles(role, roles);
  return normalized.some((r) => canAccessStudioRole(r)) || hasMusicMinistryDirection(ministryDirection);
}
