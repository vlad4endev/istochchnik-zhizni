import { apiBoolean } from '../../lib/apiBoolean';
import type { MeResponse } from '../profile/api';
import {
  roleHasPermission,
  type RolePermissionsSettingsPublic,
} from '../settings/rolePermissionsApi';
import type { AppRole } from '../settings/sectionVisibilityApi';

export function meAppRoles(me: MeResponse): AppRole[] {
  const raw = Array.isArray(me.app_roles) && me.app_roles.length > 0 ? me.app_roles : [me.app_role];
  const out: AppRole[] = [];
  for (const item of raw) {
    const r = String(item ?? '')
      .trim()
      .toLowerCase() as AppRole;
    if (
      r === 'admin' ||
      r === 'minister' ||
      r === 'pastor' ||
      r === 'editor' ||
      r === 'musician' ||
      r === 'parishioner' ||
      r === 'member'
    ) {
      if (!out.includes(r)) out.push(r);
    }
  }
  return out.length > 0 ? out : ['member'];
}

function isOrdinaryParticipant(roles: AppRole[]): boolean {
  return roles.every((r) => r === 'member' || r === 'parishioner');
}

/** Очередь сбора нужд: админ, пастор (как на API) или ответственный за сбор. */
export function userCanViewNextWeekPrayerPlan(
  me: MeResponse | undefined,
  rolePermissions?: RolePermissionsSettingsPublic | null,
): boolean {
  if (!me) return false;
  const roles = meAppRoles(me);
  if (roles.includes('admin')) return true;
  if (roles.includes('pastor')) return true;
  if (apiBoolean(me.is_collection_coordinator)) return true;

  // Обычные участники — только явный флаг координатора (выше); матрица ролей не расширяет доступ
  if (isOrdinaryParticipant(roles)) return false;

  if (rolePermissions) {
    return roles.some((role) =>
      roleHasPermission(rolePermissions, [role], 'calendar.collection_coordinator'),
    );
  }
  return false;
}

/** Рассылка молитвы в Telegram — только администратор приложения. */
export function userCanTelegramPrayerDispatch(me: MeResponse | undefined): boolean {
  if (!me) return false;
  return meAppRoles(me).includes('admin');
}

/** Редактирование срочных нужд и объявлений на главной / в молитве. */
export function userCanManageCoordinatorDashboardNotes(me: MeResponse | undefined): boolean {
  if (!me) return false;
  if (meAppRoles(me).includes('admin')) return true;
  return apiBoolean(me.is_collection_coordinator);
}
