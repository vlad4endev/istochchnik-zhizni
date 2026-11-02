import { apiClient } from './client';

export type AppSectionId =
  | 'dashboard'
  | 'prayer'
  | 'bible'
  | 'songbook'
  | 'service_planner'
  | 'studio'
  | 'sermons'
  | 'messenger';

export type AppRole =
  | 'parishioner'
  | 'member'
  | 'minister'
  | 'pastor'
  | 'musician'
  | 'editor'
  | 'admin';

export interface SectionVisibilityRule {
  enabled: boolean;
  roles: AppRole[];
}

export interface SectionVisibilitySettingsPublic {
  sections: Record<AppSectionId, SectionVisibilityRule>;
}

export function normalizeAppRole(raw: string | null | undefined): AppRole {
  const value = (raw ?? '').trim().toLowerCase();
  if (
    value === 'admin' ||
    value === 'minister' ||
    value === 'pastor' ||
    value === 'editor' ||
    value === 'musician' ||
    value === 'parishioner'
  ) {
    return value;
  }
  return 'member';
}

export async function fetchSectionVisibilitySettings(): Promise<SectionVisibilitySettingsPublic> {
  const { data } = await apiClient.get<SectionVisibilitySettingsPublic>('/api/settings/sections');
  return data;
}

/**
 * Доступ к разделу строго по списку ролей из настроек — без автоматического
 * наследования «прихожанином» прав роли «член церкви». Если раздел должен
 * быть доступен прихожанам, роль `parishioner` должна быть явно включена
 * администратором в список ролей раздела.
 */
export function canRoleAccessSection(
  settings: SectionVisibilitySettingsPublic | undefined,
  sectionId: AppSectionId,
  roleRaw: string | null | undefined,
  rolesRaw?: Array<string | null | undefined>,
): boolean {
  if (!settings) return true;
  const roles = Array.from(
    new Set(
      (Array.isArray(rolesRaw) && rolesRaw.length > 0 ? rolesRaw : [roleRaw]).map((r) =>
        normalizeAppRole(r ?? undefined),
      ),
    ),
  );
  const rule = settings.sections[sectionId];
  if (!rule || !rule.enabled) return false;
  return roles.some((role) => rule.roles.includes(role));
}
