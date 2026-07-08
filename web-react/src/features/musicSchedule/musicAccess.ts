import type { AuthRole } from '../auth/authStore';
import { isAdminAppRole, isMusicianAppRole } from '../schedules/ministryScheduleAccess';
import { hasMusicMinistryDirection, isMusicLeader } from './ministryRoleMatch';

export function canViewMusicSchedule(
  role: AuthRole | undefined,
  ministryDirection: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
  ministryRole?: unknown,
): boolean {
  return (
    isAdminAppRole(role, roles) ||
    isMusicianAppRole(role, roles) ||
    isMusicLeader(ministryRole) ||
    hasMusicMinistryDirection(ministryDirection)
  );
}

export function canManageMusicSchedule(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMusicianAppRole(role, roles) || isMusicLeader(ministryRole);
}

/** Настройка ролей музыкального расписания — администратор или музыкальный лидер. */
export function canManageMusicRoles(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isAdminAppRole(role, roles) || isMusicLeader(ministryRole);
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
