import { apiClient } from './client';

export type AppSectionId =
  | 'dashboard'
  | 'prayer'
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
  return roles.some(
    (role) =>
      rule.roles.includes(role) ||
      (role === 'parishioner' && rule.roles.includes('member')),
  );
}
