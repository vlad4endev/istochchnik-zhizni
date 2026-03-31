import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import {
  DEFAULT_LOGO_ASSET_PATH,
  LEGACY_DEFAULT_LOGO_ASSET_PATH,
  fitLogoDataUrlToStorage,
  processLogoDataUrl,
} from './logoProcessing';

/** Тот же ключ, что `ProjectBrandingNotifier._storageKey` во Flutter. */
export const PROJECT_BRANDING_STORAGE_KEY = 'project_branding_settings_v1';

export interface BrandingStateSnapshot {
  appName: string;
  description: string;
  logoAssetPath: string;
  removeLightBackground: boolean;
  logoScalePercent: number;
  customLogoDataUrl: string | null;
}

const DEFAULT_APP_NAME = 'МОЯ ЦЕРКОВЬ';
const DEFAULT_DESCRIPTION = 'Цифровая платформа';
const DEFAULT_LOGO_SCALE_PERCENT = 110;

export const brandingDefaults: BrandingStateSnapshot = {
  appName: DEFAULT_APP_NAME,
  description: DEFAULT_DESCRIPTION,
  logoAssetPath: DEFAULT_LOGO_ASSET_PATH,
  removeLightBackground: true,
  logoScalePercent: DEFAULT_LOGO_SCALE_PERCENT,
  customLogoDataUrl: null,
};

function parseBool(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() !== 'false';
}

function readString(map: Record<string, unknown>, key: string): string {
  const v = map[key];
  if (v == null) return '';
  return String(v).trim();
}

/** Разбор JSON из localStorage в том же формате, что `ProjectBrandingSettings.fromStorageMap`. */
export function brandingFromFlutterStorageJson(raw: string): BrandingStateSnapshot {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return brandingFromFlutterMap(parsed);
  } catch {
    return { ...brandingDefaults };
  }
}

export function brandingFromFlutterMap(map: Record<string, unknown>): BrandingStateSnapshot {
  const parsedLogoAssetPath = readString(map, 'logo_asset_path');
  const logoAssetPath =
    parsedLogoAssetPath === '' || parsedLogoAssetPath === LEGACY_DEFAULT_LOGO_ASSET_PATH
      ? DEFAULT_LOGO_ASSET_PATH
      : parsedLogoAssetPath;

  const appNameRaw = readString(map, 'app_name');
  const descRaw = readString(map, 'description');
  const scaleRaw = readString(map, 'logo_scale_percent');
  const parsedScale = Number.parseInt(scaleRaw, 10);
  const logoScalePercent = Number.isFinite(parsedScale)
    ? Math.min(160, Math.max(80, parsedScale))
    : DEFAULT_LOGO_SCALE_PERCENT;

  const customRaw = map.custom_logo_data_url ?? map['custom_logo_data_url'];
  const customLogoDataUrl =
    customRaw == null || String(customRaw).trim() === '' ? null : String(customRaw).trim();

  return {
    appName: appNameRaw === '' ? DEFAULT_APP_NAME : appNameRaw,
    description: descRaw === '' ? DEFAULT_DESCRIPTION : descRaw,
    logoAssetPath,
    removeLightBackground: parseBool(readString(map, 'remove_light_background') || 'true'),
    logoScalePercent,
    customLogoDataUrl,
  };
}

function toFlutterStorageMap(s: BrandingStateSnapshot): Record<string, string | null> {
  return {
    app_name: s.appName,
    description: s.description,
    logo_asset_path: s.logoAssetPath,
    remove_light_background: String(s.removeLightBackground),
    logo_scale_percent: String(s.logoScalePercent),
    custom_logo_data_url: s.customLogoDataUrl,
  };
}

const flutterBrandingStorage: StateStorage = {
  getItem: () => {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PROJECT_BRANDING_STORAGE_KEY);
    if (!raw || !raw.trim()) return null;
    const state = brandingFromFlutterStorageJson(raw);
    return JSON.stringify({ state, version: 0 });
  },
  setItem: (_name, value) => {
    if (typeof localStorage === 'undefined') return;
    try {
      const parsed = JSON.parse(value) as { state?: BrandingStateSnapshot };
      const state = parsed.state;
      if (!state) return;
      const map = toFlutterStorageMap(state);
      const json = JSON.stringify(map);
      try {
        localStorage.setItem(PROJECT_BRANDING_STORAGE_KEY, json);
      } catch {
        const stripped = { ...map, custom_logo_data_url: null };
        localStorage.setItem(PROJECT_BRANDING_STORAGE_KEY, JSON.stringify(stripped));
      }
    } catch {
      /* ignore */
    }
  },
  removeItem: () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PROJECT_BRANDING_STORAGE_KEY);
  },
};

interface BrandingStore extends BrandingStateSnapshot {
  /** Частичное обновление и запись в localStorage (через persist). */
  updateBranding: (partial: Partial<BrandingStateSnapshot>) => void;
  resetBrandingDefaults: () => void;
  /**
   * Обработка нового логотипа (data URL после выбора файла).
   * При `clear` — сбрасывает пользовательский логотип.
   */
  applyCustomLogoDataUrl: (dataUrl: string | null, clear: boolean) => Promise<void>;
}

export const useBrandingStore = create<BrandingStore>()(
  persist(
    (set, get) => ({
      ...brandingDefaults,

      updateBranding: (partial) => {
        const logoScalePercent =
          partial.logoScalePercent != null
            ? Math.min(160, Math.max(80, Math.round(partial.logoScalePercent)))
            : undefined;
        set({
          ...partial,
          ...(logoScalePercent != null ? { logoScalePercent } : {}),
        });
      },

      resetBrandingDefaults: () => {
        set({ ...brandingDefaults });
      },

      applyCustomLogoDataUrl: async (dataUrl, clear) => {
        if (clear) {
          set({ customLogoDataUrl: null });
          return;
        }
        if (!dataUrl || !dataUrl.trim()) return;
        const { removeLightBackground } = get();
        let processed = await processLogoDataUrl(dataUrl.trim(), { removeLightBackground });
        processed = await fitLogoDataUrlToStorage(processed);
        set({ customLogoDataUrl: processed });
      },
    }),
    {
      name: 'branding-persist',
      storage: createJSONStorage(() => flutterBrandingStorage),
      partialize: (s) => ({
        appName: s.appName,
        description: s.description,
        logoAssetPath: s.logoAssetPath,
        removeLightBackground: s.removeLightBackground,
        logoScalePercent: s.logoScalePercent,
        customLogoDataUrl: s.customLogoDataUrl,
      }),
    },
  ),
);
