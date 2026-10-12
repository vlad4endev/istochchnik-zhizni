/** Выбранный «шлюз» API: три готовых + свой URL. */
export type AiConnectionPresetId = 'openai' | 'deepseek' | 'openrouter' | 'gptunnel' | 'custom';

/** Группа моделей в выпадающем списке (чат / рассуждение / зрение). */
export type AiModelGroupId = 'chat' | 'reasoning' | 'vision' | 'other';

export interface AiPresetModelOption {
  id: string;
  label: string;
  /** Опциональная группа для удобного выбора в UI */
  group?: AiModelGroupId;
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

export const AI_MODEL_GROUP_LABELS: Record<AiModelGroupId, string> = {
  chat: 'Чат и текст',
  reasoning: 'Рассуждение',
  vision: 'Зрение и фото',
  other: 'Прочее',
};

export const AI_PRESET_CATALOG: readonly AiPresetCatalogEntry[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Официальный API ChatGPT (модели GPT-4o и др.)',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o-mini',
    key_hint: 'platform.openai.com → API keys',
    model_options: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', group: 'chat' },
      { id: 'gpt-4o', label: 'GPT-4o (текст и зрение)', group: 'chat' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', group: 'chat' },
      { id: 'gpt-4.1', label: 'GPT-4.1', group: 'chat' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', group: 'chat' },
      { id: 'o1-mini', label: 'o1-mini', group: 'reasoning' },
      { id: 'o3-mini', label: 'o3-mini', group: 'reasoning' },
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
      { id: 'deepseek-chat', label: 'DeepSeek-V3 (chat)', group: 'chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1 (reasoner)', group: 'reasoning' },
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
      { id: 'openai/gpt-4o-mini', label: 'OpenAI: GPT-4o mini', group: 'chat' },
      { id: 'openai/gpt-4o', label: 'OpenAI: GPT-4o', group: 'chat' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic: Claude 3.5 Sonnet', group: 'chat' },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek: V3 Chat', group: 'chat' },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek: R1', group: 'reasoning' },
      { id: 'google/gemini-2.0-flash-001', label: 'Google: Gemini 2.0 Flash', group: 'vision' },
      { id: 'google/gemini-3.1-pro-preview', label: 'Google: Gemini 3.1 Pro Preview', group: 'vision' },
      { id: 'google/gemini-3.1-flash-lite-preview', label: 'Google: Gemini 3.1 Flash Lite Preview', group: 'vision' },
    ],
  },
  {
    id: 'gptunnel',
    label: 'GPTunnel',
    description: 'Российский шлюз + RAG-базы и Assistant API для христианского помощника',
    base_url: 'https://gptunnel.ru/v1',
    default_model: 'gpt-4o-mini',
    key_hint: 'gptunnel.ru → API ключи; для RAG укажите код ассистента ниже',
    model_options: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', group: 'chat' },
      { id: 'gpt-4o', label: 'GPT-4o (текст и зрение)', group: 'chat' },
      { id: 'deepseek-chat', label: 'DeepSeek Chat', group: 'chat' },
      { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', group: 'chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1', group: 'reasoning' },
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
  if (id === 'openai' || id === 'deepseek' || id === 'openrouter' || id === 'gptunnel') {
    return id;
  }
  if (/gptunnel\.ru/i.test(n)) return 'gptunnel';
  return 'custom';
}

export function getPresetDefaults(
  id: Exclude<AiConnectionPresetId, 'custom'>,
): { base_url: string; default_model: string } {
  const p = AI_PRESET_CATALOG.find((e) => e.id === id)!;
  return { base_url: p.base_url, default_model: p.default_model };
}

export function isConnectionPresetId(s: unknown): s is AiConnectionPresetId {
  return (
    s === 'openai' ||
    s === 'deepseek' ||
    s === 'openrouter' ||
    s === 'gptunnel' ||
    s === 'custom'
  );
}
