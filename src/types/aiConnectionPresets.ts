/** Выбранный «шлюз» API: три готовых + свой URL. */
export type AiConnectionPresetId = 'openai' | 'deepseek' | 'openrouter' | 'custom';

export interface AiPresetModelOption {
  id: string;
  label: string;
}

export interface AiPresetCatalogEntry {
  id: Exclude<AiConnectionPresetId, 'custom'>;
  label: string;
  description: string;
  base_url: string;
  default_model: string;
  /** Подсказка, где взять ключ */
  key_hint: string;
  model_options: AiPresetModelOption[];
}

export const AI_PRESET_CATALOG: readonly AiPresetCatalogEntry[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Официальный API ChatGPT (модели GPT-4o и др.)',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini',
    key_hint: 'platform.openai.com → API keys',
    model_options: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { id: 'o1-mini', label: 'o1-mini' },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'Совместимый с OpenAI API, модели DeepSeek-V3 и R1',
    base_url: 'https://api.deepseek.com/v1',
    default_model: 'deepseek-chat',
    key_hint: 'platform.deepseek.com → API keys',
    model_options: [
      { id: 'deepseek-chat', label: 'DeepSeek-V3 (chat)' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (reasoner)' },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    description: 'Много моделей через один ключ. На VPS OpenRouter иногда блокирует IP (Cloudflare) — тогда используйте DeepSeek.',
    base_url: 'https://openrouter.ai/api/v1',
    default_model: 'openai/gpt-4o-mini',
    key_hint: 'openrouter.ai → Keys',
    model_options: [
      { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o mini' },
      { id: 'openai/gpt-4o', label: 'OpenAI: GPT-4o' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic: Claude 3.5 Sonnet' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek: V3 Chat' },
      { id: 'google/gemini-2.0-flash-001', label: 'Google: Gemini 2.0 Flash' },
      { id: 'google/gemini-3.1-pro-preview', label: 'Google: Gemini 3.1 Pro Preview' },
      { id: 'google/gemini-3.1-flash-lite-preview', label: 'Google: Gemini 3.1 Flash Lite Preview' },
    ],
  },
];

const PRESET_BASES = new Map(
  AI_PRESET_CATALOG.map((p) => [normalizeBase(p.base_url), p.id] as const),
);

function normalizeBase(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

export function inferConnectionPresetFromBaseUrl(baseUrl: string): AiConnectionPresetId {
  const n = normalizeBase(baseUrl);
  const id = PRESET_BASES.get(n);
  if (id === 'openai' || id === 'deepseek' || id === 'openrouter') {
    return id;
  }
  return 'custom';
}

export function getPresetDefaults(
  id: Exclude<AiConnectionPresetId, 'custom'>,
): { base_url: string; default_model: string } {
  const p = AI_PRESET_CATALOG.find((e) => e.id === id)!;
  return { base_url: p.base_url, default_model: p.default_model };
}

export function isConnectionPresetId(s: unknown): s is AiConnectionPresetId {
  return s === 'openai' || s === 'deepseek' || s === 'openrouter' || s === 'custom';
}
