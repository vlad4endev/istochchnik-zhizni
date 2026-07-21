import { apiClient } from '../../lib/apiClient';

export const APP_SECTION_IDS = [
  'dashboard',
  'feed',
  'prayer',
  'songbook',
  'service_planner',
  'studio',
  'sermons',
  'my_sermons',
  'messenger',
] as const;
export type AppSectionId = (typeof APP_SECTION_IDS)[number];

export const APP_ROLE_IDS = [
  'parishioner',
  'member',
  'minister',
  'pastor',
  'musician',
  'editor',
  'admin',
] as const;
export type AppRole = (typeof APP_ROLE_IDS)[number];

export interface SectionVisibilityRule {
  enabled: boolean;
  roles: AppRole[];
}

export type SectionVisibilityMap = Record<AppSectionId, SectionVisibilityRule>;

export interface SectionVisibilitySettingsPublic {
  sections: SectionVisibilityMap;
}

export interface SectionVisibilitySettingsAdmin extends SectionVisibilitySettingsPublic {
  role_options: { id: AppRole; label: string }[];
  section_options: { id: AppSectionId; label: string }[];
}

export function appRoleLabel(role: AppRole): string {
  if (role === 'admin') return 'Администратор';
  if (role === 'minister') return 'Служитель';
  if (role === 'pastor') return 'Пастор';
  if (role === 'editor') return 'Редактор';
  if (role === 'musician') return 'Музыкант';
  if (role === 'parishioner') return 'Прихожанин';
  return 'Участник';
}

export function appSectionLabel(section: AppSectionId): string {
  if (section === 'dashboard') return 'Главная';
  if (section === 'feed') return 'Лента';
  if (section === 'prayer') return 'Молитва';
  if (section === 'songbook') return 'Песенник';
  if (section === 'service_planner') return 'Планировщик';
  if (section === 'studio') return 'Студия';
  if (section === 'sermons') return 'Проповеди';
  if (section === 'my_sermons') return 'Мои проповеди';
  return 'Чаты';
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

export async function fetchSectionVisibilitySettingsPublic(): Promise<SectionVisibilitySettingsPublic> {
  const { data } = await apiClient.get<SectionVisibilitySettingsPublic>('/api/settings/sections');
  return data;
}

export async function fetchSectionVisibilitySettingsAdmin(): Promise<SectionVisibilitySettingsAdmin> {
  const { data } = await apiClient.get<SectionVisibilitySettingsAdmin>('/api/settings/sections/admin');
  return data;
}

export async function patchSectionVisibilitySettings(body: {
  sections: Partial<Record<AppSectionId, Partial<SectionVisibilityRule>>>;
}): Promise<SectionVisibilitySettingsPublic> {
  const { data } = await apiClient.patch<SectionVisibilitySettingsPublic>('/api/settings/sections', body);
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
