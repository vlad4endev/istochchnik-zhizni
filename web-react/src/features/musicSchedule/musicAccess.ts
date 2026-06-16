import { canModerateSongCatalogSession } from '../auth/studioAccess';
import type { AuthRole } from '../auth/authStore';
import { hasMusicMinistryDirection, isMusicManager } from './ministryRoleMatch';
import { isAdminAppRole } from '../schedules/ministryScheduleAccess';

export function canViewMusicSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canModerateSongCatalogSession(role, roles) || hasMusicMinistryDirection(ministryDirection);
}

export function canManageMusicSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMusicManager(ministryRole);
}

/** Настройка ролей музыкального расписания — только администратор. */
export function canManageMusicRoles(
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
