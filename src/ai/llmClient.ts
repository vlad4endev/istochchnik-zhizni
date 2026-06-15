import { resolveEffectiveSystemPrompt, resolveLlmRuntimeConfig } from '../services/aiSettingsService';
import type { ChatMessage } from './types';

export type AiAgentErrorCode =
  | 'ai_disabled'
  | 'ai_not_configured'
  | 'ai_http_error'
  | 'ai_bad_response';

export class AiAgentError extends Error {
  readonly code: AiAgentErrorCode;
  readonly status?: number;
  readonly bodySnippet?: string;

  constructor(
    message: string,
    code: AiAgentErrorCode,
    extra?: { status?: number; bodySnippet?: string },
  ) {
    super(message);
    this.name = 'AiAgentError';
    this.code = code;
    this.status = extra?.status;
    this.bodySnippet = extra?.bodySnippet;
  }
}

export interface ChatCompletionOptions {
  /** Переопределить модель из настроек */
  model?: string;
  /** Переопределить base_url (например OpenRouter для vision-модели) */
  base_url?: string;
  /** Переопределить API-ключ */
  api_key?: string;
  temperature?: number;
  max_tokens?: number;
  /** Раздел приложения — из админки подставляется промпт для этой функции (иначе общий системный) */
  section?: string;
  /** Не подставлять системный промпт из админки */
  skipSystemPrompt?: boolean;
}

type OpenAiCompatResponse = {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
};

/**
 * Один запрос к OpenAI-совместимому API `/chat/completions`.
 * Используйте из любых сервисов после настройки интеграции в админке (или через AI_API_KEY в .env).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  const aiDebug = process.env.AI_DEBUG === '1';
  const cfg = await resolveLlmRuntimeConfig();
  if (!cfg.enabled) {
    throw new AiAgentError('Модуль ИИ отключён в настройках.', 'ai_disabled');
  }

  const model = options.model ?? cfg.default_model;
  const baseUrl = (options.base_url ?? cfg.base_url).replace(/\/+$/, '');
  const apiKey = options.api_key ?? cfg.api_key;
  const temperature =
    typeof options.temperature === 'number' ? options.temperature : cfg.temperature;
  const max_tokens =
    typeof options.max_tokens === 'number' ? options.max_tokens : cfg.max_tokens;

  if (!apiKey) {
    throw new AiAgentError(
      'Не задан API-ключ (админка или AI_API_KEY / OPENAI_API_KEY).',
      'ai_not_configured',
    );
  }

  let msgs: ChatMessage[] = messages.slice();
  const systemFromSettings = options.skipSystemPrompt
    ? null
    : resolveEffectiveSystemPrompt(cfg, options.section);
  if (systemFromSettings && !msgs.some((m) => m.role === 'system')) {
    msgs = [{ role: 'system', content: systemFromSettings }, ...msgs];
  }

  const url = `${baseUrl}/chat/completions`;
  if (aiDebug) {
    const userChars = msgs
      .filter((m) => m.role === 'user')
      .reduce((acc, m) => {
        if (typeof m.content === 'string') return acc + m.content.length;
        return acc + m.content.reduce((n, part) => n + (part.type === 'text' ? part.text.length : 0), 0);
      }, 0);
    console.info('[ai] request', {
      section: options.section ?? null,
      base_url: baseUrl,
      model,
      message_count: msgs.length,
      user_chars: userChars,
      temperature,
      max_tokens,
    });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: msgs,
      temperature,
      max_tokens,
    }),
  });

  const rawText = await res.text();
  if (aiDebug) {
    console.info('[ai] response', {
      status: res.status,
      ok: res.ok,
      body_chars: rawText.length,
    });
  }
  let json: OpenAiCompatResponse;
  try {
    json = JSON.parse(rawText) as OpenAiCompatResponse;
  } catch {
    throw new AiAgentError(
      'Ответ провайдера не JSON',
      'ai_bad_response',
      { status: res.status, bodySnippet: rawText.slice(0, 500) },
    );
  }

  if (!res.ok) {
    const hint = typeof json.error?.message === 'string' ? json.error.message : rawText.slice(0, 400);
    throw new AiAgentError(
      hint || `HTTP ${res.status}`,
      'ai_http_error',
      { status: res.status, bodySnippet: rawText.slice(0, 500) },
    );
  }

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AiAgentError('В ответе нет choices[0].message.content', 'ai_bad_response');
  }
  return content;
}
