import type { MeProfile } from '../api/profile';
import type { AuthRole } from '../stores/authStore';

function apiBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function normalizeRoles(role: AuthRole | undefined, roles?: AuthRole[]): AuthRole[] {
  if (Array.isArray(roles) && roles.length > 0) return roles;
  return role ? [role] : ['member'];
}

export function canViewPrayerCyclePlan(
  role: AuthRole | undefined,
  roles: AuthRole[] | undefined,
  me?: MeProfile | null,
): boolean {
  const r = normalizeRoles(role, roles).map((x) => String(x).toLowerCase());
  if (r.includes('admin') || r.includes('pastor')) return true;
  if (apiBoolean(me?.is_collection_coordinator)) return true;
  return false;
}
