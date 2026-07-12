import { canModerateSongCatalogSession } from '../auth/studioAccess';
import type { AuthRole } from '../auth/authStore';
import { hasMediaMinistryDirection, isMediaManager } from './ministryRoleMatch';
import { isAdminAppRole } from '../schedules/ministryScheduleAccess';

export function canViewMediaSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
  ministryRole?: unknown,
): boolean {
  return (
    canModerateSongCatalogSession(role, roles) ||
    isMediaManager(ministryRole) ||
    hasMediaMinistryDirection(ministryDirection)
  );
}

export function canManageMediaSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMediaManager(ministryRole);
}

/** Настройка ролей медиа-расписания — только администратор. */
export function canManageMediaRoles(
  role: AuthRole | undefined,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles);
}

export function assignmentStatusBorderColor(status: string): string {
  if (status === 'confirmed') return 'var(--btn-success-bg, #16a34a)';
  if (status === 'declined') return '#dc2626';
  return '#d97706';
}

export function assignmentStatusLabel(status: string): string {
  if (status === 'confirmed') return 'Подтверждено';
  if (status === 'declined') return 'Отказался';
  if (status === 'pending') return 'Ожидает';
  return 'Назначен';
}
