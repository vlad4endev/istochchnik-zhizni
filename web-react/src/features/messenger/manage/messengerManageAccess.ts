import type { AuthRole } from '../../auth/authStore';

/** Роль «Администратор» в приложении (как в `authStore` / `members.app_role`). */
export function isAppAdministratorRole(
  role: AuthRole | string | null | undefined,
  roles?: readonly (string | AuthRole)[] | null,
): boolean {
  if (String(role ?? '').trim().toLowerCase() === 'admin') return true;
  if (Array.isArray(roles)) {
    return roles.some((r) => String(r ?? '').trim().toLowerCase() === 'admin');
  }
  return false;
}

export type EffectivePerms = { can_manage_chat?: boolean; can_add_users?: boolean } | null | undefined;

/**
 * Редактирование группы/канала (название, фото, разрешения, права участников):
 * глобальный админ приложения ИЛИ включено «Управление чатом» у участника (по умолчанию у новых — выкл.).
 */
export function canManageGroupMessenger(effective: EffectivePerms, isAppAdministrator: boolean): boolean {
  if (isAppAdministrator) return true;
  return effective?.can_manage_chat === true;
}

export function canAddParticipantsToGroup(effective: EffectivePerms, isAppAdministrator: boolean): boolean {
  if (isAppAdministrator) return true;
  return effective?.can_add_users === true;
}
