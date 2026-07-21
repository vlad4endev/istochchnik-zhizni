import { query } from '../config/db';
import {
  AI_PRESET_CATALOG,
  getPresetDefaults,
  isConnectionPresetId,
  type AiConnectionPresetId,
} from '../types/aiConnectionPresets';
import { AI_PROMPT_SCOPE_LIST, isAiPromptScopeId, type AiPromptScopeId } from '../types/aiPromptScopes';
import {
  type AiSectionPrompts,
  type AiSettingsAdminView,
  type AiSettingsDocument,
  buildSectionPromptsAdminView,
  maskApiKey,
  normalizeAiSettingsDocument,
} from '../types/aiSettings';

async function ensureColumn(): Promise<void> {
  await query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS ai_settings_json TEXT');
}

function envApiKey(): string | null {
  const g =
    typeof process.env.GPTUNNEL_API_KEY === 'string' ? process.env.GPTUNNEL_API_KEY.trim() : '';
  if (g) return g;
  const a = typeof process.env.AI_API_KEY === 'string' ? process.env.AI_API_KEY.trim() : '';
  if (a) return a;
  const b = typeof process.env.OPENAI_API_KEY === 'string' ? process.env.OPENAI_API_KEY.trim() : '';
  return b || null;
}

function envAssistantCode(): string | null {
  const a =
    typeof process.env.GPTUNNEL_ASSISTANT_CODE === 'string'
      ? process.env.GPTUNNEL_ASSISTANT_CODE.trim()
      : '';
  if (!a) return null;
  return a.replace(/^@+/, '');
}

function envBaseUrl(): string | null {
  const u = typeof process.env.AI_BASE_URL === 'string' ? process.env.AI_BASE_URL.trim() : '';
  if (!u) return null;
  return u.replace(/\/+$/, '');
}

function envModel(): string | null {
  const m = typeof process.env.AI_MODEL === 'string' ? process.env.AI_MODEL.trim() : '';
  return m || null;
}

export async function loadAiSettingsDocument(): Promise<AiSettingsDocument> {
  await ensureColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const { rows } = await query('SELECT ai_settings_json FROM global_settings WHERE id = 1');
  const raw = rows[0]?.ai_settings_json;
  if (typeof raw !== 'string' || !raw.trim()) {
    return normalizeAiSettingsDocument(null);
  }
  try {
    return normalizeAiSettingsDocument(JSON.parse(raw) as unknown);
  } catch {
    return normalizeAiSettingsDocument(null);
  }
}

export async function saveAiSettingsDocument(doc: AiSettingsDocument): Promise<void> {
  await ensureColumn();
  const json = JSON.stringify(doc);
  await query(
    `INSERT INTO global_settings (id, start_date, ai_settings_json)
     VALUES (1, CURRENT_DATE, $1)
     ON CONFLICT (id) DO UPDATE SET ai_settings_json = EXCLUDED.ai_settings_json`,
    [json],
  );
}

/** Для админки: маска ключа и флаг наличия ключа (БД или env). */
export async function getAiSettingsAdmin(): Promise<AiSettingsAdminView> {
  const doc = await loadAiSettingsDocument();
  const key = doc.api_key ?? envApiKey();
  const assistantCode = doc.gptunnel_assistant_code ?? envAssistantCode();
  return {
    enabled: doc.enabled,
    provider: doc.provider,
    connection_preset: doc.connection_preset,
    preset_catalog: [...AI_PRESET_CATALOG],
    base_url: doc.base_url,
    api_key_masked: maskApiKey(key),
    has_api_key: Boolean(key),
    default_model: doc.default_model,
    system_prompt: doc.system_prompt,
    prompt_scopes: AI_PROMPT_SCOPE_LIST.map((s) => ({ id: s.id, label: s.label })),
    section_prompts: buildSectionPromptsAdminView(doc),
    temperature: doc.temperature,
    max_tokens: doc.max_tokens,
    gptunnel_assistant_code: assistantCode,
  };
}

export interface AiSettingsPatch {
  enabled?: boolean;
  connection_preset?: AiConnectionPresetId | null;
  base_url?: string | null;
  /** undefined — не менять; null — сбросить ключ в БД (останется env); непустая строка — записать */
  api_key?: string | null;
  default_model?: string | null;
  system_prompt?: string | null;
  /** Частичное обновление промптов по разделам: ключ — id раздела, null/пустая строка — удалить */
  section_prompts?: Partial<Record<AiPromptScopeId, string | null>>;
  temperature?: number | null;
  max_tokens?: number | null;
  /** Код ассистента GPTunnel; null — сбросить */
  gptunnel_assistant_code?: string | null;
}

export async function updateAiSettings(patch: AiSettingsPatch): Promise<AiSettingsAdminView> {
  const current = await loadAiSettingsDocument();
  const next: AiSettingsDocument = { ...current };

  if (typeof patch.enabled === 'boolean') {
    next.enabled = patch.enabled;
  }
  if (
    patch.connection_preset !== undefined &&
    patch.connection_preset !== null &&
    isConnectionPresetId(patch.connection_preset)
  ) {
    next.connection_preset = patch.connection_preset;
    if (patch.connection_preset !== 'custom') {
      const d = getPresetDefaults(patch.connection_preset);
      next.base_url = d.base_url;
      next.default_model = d.default_model;
    }
  }
  if (patch.base_url !== undefined) {
    if (patch.base_url === null || (typeof patch.base_url === 'string' && !patch.base_url.trim())) {
      next.base_url = normalizeAiSettingsDocument(null).base_url;
    } else if (typeof patch.base_url === 'string') {
      next.base_url = patch.base_url.trim().replace(/\/+$/, '');
    }
  }
  if (patch.api_key !== undefined) {
    if (patch.api_key === null) {
      next.api_key = null;
    } else if (typeof patch.api_key === 'string') {
      const t = patch.api_key.trim();
      next.api_key = t.length > 0 ? t : next.api_key;
    }
  }
  if (patch.default_model !== undefined) {
    if (patch.default_model === null || (typeof patch.default_model === 'string' && !patch.default_model.trim())) {
      next.default_model = normalizeAiSettingsDocument(null).default_model;
    } else if (typeof patch.default_model === 'string') {
      next.default_model = patch.default_model.trim();
    }
  }
  if (patch.system_prompt !== undefined) {
    if (patch.system_prompt === null) {
      next.system_prompt = null;
    } else if (typeof patch.system_prompt === 'string') {
      const t = patch.system_prompt.trim();
      next.system_prompt = t.length ? t : null;
    }
  }
  if (patch.section_prompts !== undefined && typeof patch.section_prompts === 'object') {
    const merged: AiSectionPrompts = { ...next.section_prompts };
    for (const key of Object.keys(patch.section_prompts) as AiPromptScopeId[]) {
      const val = patch.section_prompts[key];
      if (val === undefined) continue;
      if (val === null) {
        delete merged[key];
      } else if (typeof val === 'string') {
        const t = val.trim();
        if (t.length > 0) {
          merged[key] = t;
        } else {
          delete merged[key];
        }
      }
    }
    next.section_prompts = merged;
  }
  if (patch.temperature !== undefined) {
    if (patch.temperature !== null && typeof patch.temperature === 'number') {
      next.temperature = patch.temperature;
    }
  }
  if (patch.max_tokens !== undefined) {
    if (patch.max_tokens !== null && typeof patch.max_tokens === 'number') {
      next.max_tokens = patch.max_tokens;
    }
  }
  if (patch.gptunnel_assistant_code !== undefined) {
    if (patch.gptunnel_assistant_code === null) {
      next.gptunnel_assistant_code = null;
    } else if (typeof patch.gptunnel_assistant_code === 'string') {
      const t = patch.gptunnel_assistant_code.trim().replace(/^@+/, '');
      next.gptunnel_assistant_code = t.length > 0 ? t : null;
    }
  }

  const normalized = normalizeAiSettingsDocument(next);
  await saveAiSettingsDocument(normalized);
  return getAiSettingsAdmin();
}

/** Рантайм: объединение БД и env (для вызовов LLM). */
export interface ResolvedLlmConfig {
  enabled: boolean;
  base_url: string;
  api_key: string | null;
  default_model: string;
  system_prompt: string | null;
  section_prompts: AiSectionPrompts;
  temperature: number;
  max_tokens: number;
  gptunnel_assistant_code: string | null;
}

/** Эффективный системный промпт: для `section` — свой текст, иначе общий `system_prompt`. */
export function resolveEffectiveSystemPrompt(
  cfg: ResolvedLlmConfig,
  section: string | undefined,
): string | null {
  if (section && isAiPromptScopeId(section)) {
    const p = cfg.section_prompts[section];
    if (typeof p === 'string' && p.trim().length > 0) {
      return p.trim();
    }
  }
  return cfg.system_prompt;
}

export async function resolveLlmRuntimeConfig(): Promise<ResolvedLlmConfig> {
  const doc = await loadAiSettingsDocument();
  const apiKey = doc.api_key ?? envApiKey();
  const baseFromEnv = envBaseUrl();
  const modelFromEnv = envModel();
  const envEnabledRaw =
    typeof process.env.AI_ENABLED === 'string' ? process.env.AI_ENABLED.trim().toLowerCase() : '';
  const envEnabled =
    envEnabledRaw === '1' || envEnabledRaw === 'true' || envEnabledRaw === 'yes'
      ? true
      : envEnabledRaw === '0' || envEnabledRaw === 'false' || envEnabledRaw === 'no'
        ? false
        : null;
  return {
    enabled: envEnabled ?? doc.enabled,
    base_url: baseFromEnv ?? doc.base_url,
    api_key: apiKey,
    default_model: modelFromEnv ?? doc.default_model,
    system_prompt: doc.system_prompt,
    section_prompts: doc.section_prompts,
    temperature: doc.temperature,
    max_tokens: doc.max_tokens,
    gptunnel_assistant_code: doc.gptunnel_assistant_code ?? envAssistantCode(),
  };
}
