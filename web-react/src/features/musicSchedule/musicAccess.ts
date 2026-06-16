import type { AuthRole } from '../auth/authStore';
import { hasMusicMinistryDirection, isMusicLeader } from './ministryRoleMatch';

export function canViewMusicSchedule(
  _role: AuthRole | undefined,
  ministryDirection: unknown,
  _roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return hasMusicMinistryDirection(ministryDirection);
}

export function canManageMusicSchedule(
  _role: AuthRole | undefined,
  ministryRole: unknown,
  _roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return isMusicLeader(ministryRole);
}

/** Настройка ролей музыкального расписания — только музыкальный лидер. */
export function canManageMusicRoles(
  role: AuthRole | undefined,
  ministryRole: unknown,
  roles?: Array<AuthRole | string | null | undefined>,
): boolean {
  return canManageMusicSchedule(role, ministryRole, roles);
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
