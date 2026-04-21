export const APP_SECTION_IDS = [
  'dashboard',
  'prayer',
  'songbook',
  'service_planner',
  'studio',
  'sermons',
  'messenger',
] as const;

export type AppSectionId = (typeof APP_SECTION_IDS)[number];
export type AppRole = 'member' | 'pastor' | 'musician' | 'editor' | 'admin';

export const APP_ROLE_IDS: readonly AppRole[] = ['member', 'pastor', 'musician', 'editor', 'admin'] as const;

export interface SectionVisibilityRule {
  enabled: boolean;
  roles: AppRole[];
}

export type SectionVisibilityMap = Record<AppSectionId, SectionVisibilityRule>;

export interface SectionVisibilitySettingsDocument {
  sections: SectionVisibilityMap;
}

function defaultRule(): SectionVisibilityRule {
  return {
    enabled: true,
    roles: [...APP_ROLE_IDS],
  };
}

export function defaultSectionVisibilitySettings(): SectionVisibilitySettingsDocument {
  return {
    sections: {
      dashboard: defaultRule(),
      prayer: defaultRule(),
      songbook: defaultRule(),
      service_planner: {
        enabled: true,
        roles: ['admin'],
      },
      studio: defaultRule(),
      sermons: defaultRule(),
      messenger: defaultRule(),
    },
  };
}

function normalizeRole(raw: unknown): AppRole | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'member' || v === 'pastor' || v === 'musician' || v === 'editor' || v === 'admin') {
    return v;
  }
  return null;
}

function normalizeRule(raw: unknown, fallback: SectionVisibilityRule): SectionVisibilityRule {
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const input = raw as { enabled?: unknown; roles?: unknown };
  const enabled = typeof input.enabled === 'boolean' ? input.enabled : fallback.enabled;
  const rawRoles = Array.isArray(input.roles) ? input.roles : fallback.roles;
  const normalizedRoles: AppRole[] = [];
  for (const item of rawRoles) {
    const role = normalizeRole(item);
    if (role && !normalizedRoles.includes(role)) {
      normalizedRoles.push(role);
    }
  }
  return {
    enabled,
    roles: normalizedRoles.length > 0 ? normalizedRoles : [...fallback.roles],
  };
}

export function normalizeSectionVisibilitySettings(raw: unknown): SectionVisibilitySettingsDocument {
  const defaults = defaultSectionVisibilitySettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }
  const input = raw as { sections?: unknown };
  const src = input.sections && typeof input.sections === 'object' ? (input.sections as Record<string, unknown>) : {};
  const out = { ...defaults.sections };
  for (const sectionId of APP_SECTION_IDS) {
    out[sectionId] = normalizeRule(src[sectionId], defaults.sections[sectionId]);
  }
  return { sections: out };
}

export function isSectionVisibleForRole(
  doc: SectionVisibilitySettingsDocument,
  sectionId: AppSectionId,
  roleRaw: string | null | undefined,
): boolean {
  const role = normalizeRole(roleRaw) ?? 'member';
  const rule = doc.sections[sectionId];
  if (!rule.enabled) return false;
  return rule.roles.includes(role);
}
