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

function rolesLower(role: AuthRole | undefined, roles?: AuthRole[]): string[] {
  return normalizeRoles(role, roles).map((x) => String(x).toLowerCase());
}

/** Срочная нужда и объявление: админ или ответственный за сбор (как на вебе). */
export function canManageCoordinatorNotes(
  role: AuthRole | undefined,
  roles: AuthRole[] | undefined,
  me?: MeProfile | null,
): boolean {
  return rolesLower(role, roles).includes('admin') || apiBoolean(me?.is_collection_coordinator);
}

/** Рассылка молитвы в Telegram — только администратор. */
export function canTelegramPrayerDispatch(
  role: AuthRole | undefined,
  roles: AuthRole[] | undefined,
): boolean {
  return rolesLower(role, roles).includes('admin');
}

/** Кто сегодня открывал раздел — админ и пастор. */
export function canViewPrayerViewers(
  role: AuthRole | undefined,
  roles: AuthRole[] | undefined,
): boolean {
  const r = rolesLower(role, roles);
  return r.includes('admin') || r.includes('pastor');
}
