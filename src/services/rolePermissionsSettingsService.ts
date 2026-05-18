import { query } from '../config/db';
import {
  APP_PERMISSION_IDS,
  type AppPermissionId,
  defaultRolePermissionsSettings,
  normalizeRolePermissionsSettings,
  parseSectionPermissionKey,
  rolesWithSectionPermission,
  type RolePermissionsSettingsDocument,
} from '../types/appPermissions';
import { APP_ROLE_IDS, type AppRole } from '../types/sectionVisibilitySettings';
import {
  loadSectionVisibilitySettings,
  saveSectionVisibilitySettings,
} from './sectionVisibilitySettingsService';
import { APP_SECTION_IDS, type SectionVisibilitySettingsDocument } from '../types/sectionVisibilitySettings';

let cachedDoc: RolePermissionsSettingsDocument | null = null;
let cacheAt = 0;
const CACHE_MS = 15_000;

async function ensureColumn(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS role_permissions_json TEXT');
}

export async function loadRolePermissionsSettings(): Promise<RolePermissionsSettingsDocument> {
  const now = Date.now();
  if (cachedDoc && now - cacheAt < CACHE_MS) {
    return cachedDoc;
  }

  await ensureColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query('SELECT role_permissions_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.role_permissions_json;
  let doc: RolePermissionsSettingsDocument;
  if (typeof raw !== 'string' || !raw.trim()) {
    doc = normalizeRolePermissionsSettings(null);
  } else {
    try {
      doc = normalizeRolePermissionsSettings(JSON.parse(raw) as unknown);
    } catch {
      doc = normalizeRolePermissionsSettings(null);
    }
  }
  cachedDoc = doc;
  cacheAt = now;
  return doc;
}

function invalidateCache(): void {
  cachedDoc = null;
  cacheAt = 0;
}

export async function saveRolePermissionsSettings(doc: RolePermissionsSettingsDocument): Promise<void> {
  await ensureColumn();
  const normalized = normalizeRolePermissionsSettings(doc);
  const json = JSON.stringify(normalized);
  await query(
    `INSERT INTO global_settings (id, start_date, role_permissions_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET role_permissions_json = EXCLUDED.role_permissions_json`,
    [json],
  );
  invalidateCache();
}

export type RolePermissionsPatch = Partial<
  Record<
    AppRole,
    Partial<Record<AppPermissionId, boolean>>
  >
>;

async function syncSectionVisibilityFromPermissions(
  doc: RolePermissionsSettingsDocument,
): Promise<void> {
  const current = await loadSectionVisibilitySettings();
  const next: SectionVisibilitySettingsDocument = {
    sections: { ...current.sections },
  };
  for (const sectionId of APP_SECTION_IDS) {
    const allowedRoles = rolesWithSectionPermission(doc, sectionId);
    const prev = next.sections[sectionId];
    next.sections[sectionId] = {
      enabled: prev.enabled,
      roles: allowedRoles.length > 0 ? allowedRoles : [...prev.roles],
    };
  }
  await saveSectionVisibilitySettings(next);
}

export async function patchRolePermissionsSettings(
  patch: RolePermissionsPatch,
): Promise<RolePermissionsSettingsDocument> {
  const current = await loadRolePermissionsSettings();
  const next: RolePermissionsSettingsDocument = {
    roles: { ...current.roles },
  };

  for (const roleId of APP_ROLE_IDS) {
    const rolePatch = patch[roleId];
    if (!rolePatch || typeof rolePatch !== 'object') continue;
    const map = { ...next.roles[roleId] };
    for (const [key, value] of Object.entries(rolePatch)) {
      if (!APP_PERMISSION_IDS.includes(key as AppPermissionId)) continue;
      if (typeof value !== 'boolean') continue;
      const permId = key as AppPermissionId;
      if (roleId === 'admin' && (permId === 'admin.panel' || permId === 'admin.users_manage') && !value) {
        continue;
      }
      map[permId] = value;
    }
    next.roles[roleId] = map;
  }

  const normalized = normalizeRolePermissionsSettings(next);
  await saveRolePermissionsSettings(normalized);

  const touchesSection = Object.values(patch).some(
    (rolePatch) =>
      rolePatch &&
      Object.keys(rolePatch).some((k) => parseSectionPermissionKey(k as AppPermissionId) !== null),
  );
  if (touchesSection) {
    await syncSectionVisibilityFromPermissions(normalized);
  }

  return normalized;
}

export async function resetRolePermissionsSettings(): Promise<RolePermissionsSettingsDocument> {
  const defaults = defaultRolePermissionsSettings();
  await saveRolePermissionsSettings(defaults);
  await syncSectionVisibilityFromPermissions(defaults);
  return defaults;
}
