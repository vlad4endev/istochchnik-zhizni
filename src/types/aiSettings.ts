import type { AiConnectionPresetId, AiPresetCatalogEntry } from './aiConnectionPresets';
import { inferConnectionPresetFromBaseUrl, isConnectionPresetId } from './aiConnectionPresets';
import {
  AI_PROMPT_SCOPE_LIST,
  type AiPromptScopeId,
  isAiPromptScopeId,
} from './aiPromptScopes';

export type AiProviderId = 'openai_compatible';

export type { AiConnectionPresetId };

/** Промпты по разделам: если для раздела не задано, используется общий `system_prompt`. */
export type AiSectionPrompts = Partial<Record<AiPromptScopeId, string>>;

/** Модели по разделам: если для раздела не задано, используется `default_model`. */
export type AiSectionModels = Partial<Record<AiPromptScopeId, string>>;

export interface AiSettingsDocument {
  enabled: boolean;
  provider: AiProviderId;
  /** Мастер выбора: готовые OpenAI / DeepSeek / OpenRouter или свой URL */
  connection_preset: AiConnectionPresetId;
  /** База API без завершающего слэша, например https://api.openai.com/v1 */
  base_url: string;
  /** Ключ в JSON; может быть null если задан только через переменные окружения */
  api_key: string | null;
  default_model: string;
  system_prompt: string | null;
  section_prompts: AiSectionPrompts;
  /** Отдельная модель для раздела приложения (категории проекта) */
  section_models: AiSectionModels;
  temperature: number;
  max_tokens: number;
  /**
   * Код ассистента GPTunnel (Assistant API + RAG).
   * Если задан — мессенджер «ИИ помощник» использует /v1/assistant/chat.
   */
  gptunnel_assistant_code: string | null;
}

export interface AiPromptScopeOption {
  id: AiPromptScopeId;
  label: string;
}

export interface AiSettingsAdminView {
  enabled: boolean;
  provider: AiProviderId;
  base_url: string;
  api_key_masked: string | null;
  has_api_key: boolean;
  default_model: string;
  system_prompt: string | null;
  /** Список разделов (категорий проекта) для UI */
  prompt_scopes: AiPromptScopeOption[];
  /** Значения по каждому разделу (null — не задано, возьмётся общий промпт) */
  section_prompts: Record<AiPromptScopeId, string | null>;
  /** Модель по разделу (null — использовать default_model) */
  section_models: Record<AiPromptScopeId, string | null>;
  connection_preset: AiConnectionPresetId;
  /** Каталог пресетов для админки (одинаковый при каждом ответе) */
  preset_catalog: AiPresetCatalogEntry[];
  temperature: number;
  max_tokens: number;
  gptunnel_assistant_code: string | null;
}

const DEFAULT_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

function clampTemp(v: number): number {
  if (Number.isNaN(v)) return 0.7;
  return Math.min(2, Math.max(0, v));
}

function clampMaxTokens(v: number): number {
  if (Number.isNaN(v)) return 2048;
  return Math.min(128_000, Math.max(64, Math.floor(v)));
}

function normalizeSectionPrompts(raw: unknown): AiSectionPrompts {
  const out: AiSectionPrompts = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!isAiPromptScopeId(key)) continue;
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      out[key] = v.trim();
    }
  }
  return out;
}

function normalizeSectionModels(raw: unknown): AiSectionModels {
  const out: AiSectionModels = {};
  if (!raw || typeof raw !== 'object') {
    return out;
  }
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o)) {
    if (!isAiPromptScopeId(key)) continue;
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      out[key] = v.trim();
    }
  }
  return out;
}

export function normalizeAiSettingsDocument(raw: unknown): AiSettingsDocument {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const enabled = Boolean(o.enabled);
  const provider: AiProviderId = o.provider === 'openai_compatible' ? 'openai_compatible' : 'openai_compatible';

  let base_url = typeof o.base_url === 'string' && o.base_url.trim() ? o.base_url.trim() : DEFAULT_BASE;
  base_url = base_url.replace(/\/+$/, '');

  const api_key =
    typeof o.api_key === 'string' && o.api_key.trim().length > 0 ? o.api_key.trim() : null;

  const default_model =
    typeof o.default_model === 'string' && o.default_model.trim() ? o.default_model.trim() : DEFAULT_MODEL;

  const system_prompt =
    typeof o.system_prompt === 'string' && o.system_prompt.trim().length > 0
      ? o.system_prompt
      : null;

  const temperature =
    typeof o.temperature === 'number' ? clampTemp(o.temperature) : clampTemp(Number(o.temperature));

  const max_tokens =
    typeof o.max_tokens === 'number' ? clampMaxTokens(o.max_tokens) : clampMaxTokens(Number(o.max_tokens));

  const section_prompts = normalizeSectionPrompts(o.section_prompts);
  const section_models = normalizeSectionModels(o.section_models);

  const connection_preset: AiConnectionPresetId =
    typeof o.connection_preset === 'string' && isConnectionPresetId(o.connection_preset)
      ? o.connection_preset
      : inferConnectionPresetFromBaseUrl(base_url);

  const gptunnel_assistant_code =
    typeof o.gptunnel_assistant_code === 'string' && o.gptunnel_assistant_code.trim().length > 0
      ? o.gptunnel_assistant_code.trim().replace(/^@+/, '')
      : null;

  return {
    enabled,
    provider,
    connection_preset,
    base_url,
    api_key,
    default_model,
    system_prompt,
    section_prompts,
    section_models,
    temperature,
    max_tokens,
    gptunnel_assistant_code,
  };
}

export function buildSectionPromptsAdminView(doc: AiSettingsDocument): Record<AiPromptScopeId, string | null> {
  const out = {} as Record<AiPromptScopeId, string | null>;
  for (const { id } of AI_PROMPT_SCOPE_LIST) {
    const p = doc.section_prompts[id];
    out[id] = typeof p === 'string' && p.trim().length > 0 ? p : null;
  }
  return out;
}

export function buildSectionModelsAdminView(doc: AiSettingsDocument): Record<AiPromptScopeId, string | null> {
  const out = {} as Record<AiPromptScopeId, string | null>;
  for (const { id } of AI_PROMPT_SCOPE_LIST) {
    const m = doc.section_models[id];
    out[id] = typeof m === 'string' && m.trim().length > 0 ? m : null;
  }
  return out;
}

export function maskApiKey(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 8) return '********';
  return `${raw.slice(0, 4)}…${raw.slice(-4)}`;
}
