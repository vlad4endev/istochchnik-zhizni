import { query } from '../config/db';
import {
  type AppSectionId,
  type AppRole,
  APP_SECTION_IDS,
  APP_ROLE_IDS,
  type SectionVisibilitySettingsDocument,
  normalizeSectionVisibilitySettings,
} from '../types/sectionVisibilitySettings';

async function ensureColumn(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS section_visibility_json TEXT');
}

export async function loadSectionVisibilitySettings(): Promise<SectionVisibilitySettingsDocument> {
  await ensureColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query('SELECT section_visibility_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.section_visibility_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return normalizeSectionVisibilitySettings(null);
  }
  try {
    return normalizeSectionVisibilitySettings(JSON.parse(raw) as unknown);
  } catch {
    return normalizeSectionVisibilitySettings(null);
  }
}

export async function saveSectionVisibilitySettings(doc: SectionVisibilitySettingsDocument): Promise<void> {
  await ensureColumn();
  const json = JSON.stringify(doc);
  await query(
    `INSERT INTO global_settings (id, start_date, section_visibility_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET section_visibility_json = EXCLUDED.section_visibility_json`,
    [json],
  );
}

export type SectionVisibilityPatch = Partial<
  Record<
    AppSectionId,
    {
      enabled?: boolean;
      roles?: AppRole[];
    }
  >
>;

export async function patchSectionVisibilitySettings(
  patch: SectionVisibilityPatch,
): Promise<SectionVisibilitySettingsDocument> {
  const current = await loadSectionVisibilitySettings();
  const next: SectionVisibilitySettingsDocument = {
    sections: { ...current.sections },
  };

  for (const sectionId of APP_SECTION_IDS) {
    const one = patch[sectionId];
    if (!one) continue;
    const prev = next.sections[sectionId];
    const enabled = typeof one.enabled === 'boolean' ? one.enabled : prev.enabled;
    let roles = prev.roles;
    if (Array.isArray(one.roles)) {
      const cleaned: AppRole[] = [];
      for (const role of one.roles) {
        if (APP_ROLE_IDS.includes(role) && !cleaned.includes(role)) {
          cleaned.push(role);
        }
      }
      roles = cleaned.length > 0 ? cleaned : [...prev.roles];
    }
    next.sections[sectionId] = { enabled, roles };
  }

  const normalized = normalizeSectionVisibilitySettings(next);
  await saveSectionVisibilitySettings(normalized);
  return normalized;
}
