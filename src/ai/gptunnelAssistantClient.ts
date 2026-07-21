import { AiAgentError } from './llmClient';
import { resolveLlmRuntimeConfig } from '../services/aiSettingsService';

export type GptunnelAssistantChatInput = {
  /** 24–36 символов, стабильный ID диалога на стороне клиента */
  chatId: string;
  message: string;
  assistantCode?: string;
  maxContext?: number;
  api_key?: string;
  base_url?: string;
};

export type GptunnelAssistantChatResult = {
  message: string;
  model?: string;
  usage?: Record<string, unknown>;
};

type GptunnelAssistantResponse = {
  message?: string;
  model?: string;
  usage?: Record<string, unknown>;
  error?: { message?: string } | string;
};

const DEFAULT_GPTUNNEL_BASE = 'https://gptunnel.ru/v1';

function envAssistantCode(): string | null {
  const a =
    typeof process.env.GPTUNNEL_ASSISTANT_CODE === 'string'
      ? process.env.GPTUNNEL_ASSISTANT_CODE.trim()
      : '';
  if (a) return a.replace(/^@+/, '');
  return null;
}

function envGptunnelKey(): string | null {
  const a =
    typeof process.env.GPTUNNEL_API_KEY === 'string' ? process.env.GPTUNNEL_API_KEY.trim() : '';
  if (a) return a;
  return null;
}

/** Стабильный chatId для GPTunnel (24–36 символов) из id разговора. */
export function gptunnelChatIdFromConversation(conversationId: string): string {
  const digits = String(conversationId ?? '').replace(/\D/g, '') || '0';
  const base = `izasst${digits}`;
  if (base.length < 24) return base.padEnd(24, '0');
  if (base.length > 36) return base.slice(0, 36);
  return base;
}

export function isGptunnelBaseUrl(baseUrl: string): boolean {
  return /gptunnel\.ru/i.test(baseUrl);
}

/**
 * Чат с ассистентом GPTunnel (RAG-базы подключены к ассистенту в кабинете).
 * Auth: `Authorization: <API_KEY>` (как в документации; Bearer тоже принимается).
 */
export async function gptunnelAssistantChat(
  input: GptunnelAssistantChatInput,
): Promise<GptunnelAssistantChatResult> {
  let enabled = true;
  let cfgAssistant: string | null = null;
  let cfgKey: string | null = null;
  let cfgBase = DEFAULT_GPTUNNEL_BASE;
  try {
    const cfg = await resolveLlmRuntimeConfig();
    enabled = cfg.enabled;
    cfgAssistant = cfg.gptunnel_assistant_code;
    cfgKey = cfg.api_key;
    cfgBase = cfg.base_url || DEFAULT_GPTUNNEL_BASE;
  } catch (e) {
    // Локально/в CI без Postgres — достаточно env и явных параметров вызова.
    console.warn('[ai/gptunnel] resolveLlmRuntimeConfig failed, using env/args:', e);
    const envEn =
      typeof process.env.AI_ENABLED === 'string' ? process.env.AI_ENABLED.trim().toLowerCase() : '';
    if (envEn === '0' || envEn === 'false' || envEn === 'no') enabled = false;
  }

  if (!enabled) {
    throw new AiAgentError('Модуль ИИ отключён в настройках.', 'ai_disabled');
  }

  const assistantCode = (
    input.assistantCode ??
    cfgAssistant ??
    envAssistantCode() ??
    ''
  )
    .trim()
    .replace(/^@+/, '');
  if (!assistantCode) {
    throw new AiAgentError(
      'Не задан код ассистента GPTunnel (админка или GPTUNNEL_ASSISTANT_CODE).',
      'ai_not_configured',
    );
  }

  const apiKey = input.api_key ?? envGptunnelKey() ?? cfgKey;
  if (!apiKey) {
    throw new AiAgentError(
      'Не задан API-ключ GPTunnel (админка, GPTUNNEL_API_KEY или AI_API_KEY).',
      'ai_not_configured',
    );
  }

  const baseUrl = (input.base_url ?? cfgBase ?? DEFAULT_GPTUNNEL_BASE)
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, '');
  const root = isGptunnelBaseUrl(baseUrl) ? baseUrl : DEFAULT_GPTUNNEL_BASE;
  const url = `${root}/assistant/chat`;

  const chatId = String(input.chatId ?? '').trim();
  if (chatId.length < 24 || chatId.length > 36) {
    throw new AiAgentError(
      `chatId для GPTunnel должен быть 24–36 символов (сейчас ${chatId.length}).`,
      'ai_bad_response',
    );
  }

  const message = String(input.message ?? '').trim();
  if (!message) {
    throw new AiAgentError('Пустое сообщение для ассистента GPTunnel.', 'ai_bad_response');
  }

  const maxContext =
    typeof input.maxContext === 'number' && Number.isFinite(input.maxContext)
      ? Math.max(0, Math.min(40, Math.floor(input.maxContext)))
      : 16;

  const body = JSON.stringify({
    chatId,
    assistantCode,
    message,
    maxContext,
  });

  const aiDebug = process.env.AI_DEBUG === '1';
  if (aiDebug) {
    console.info('[ai/gptunnel] assistant chat', {
      url,
      assistantCode,
      chatId,
      message_chars: message.length,
      maxContext,
    });
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body,
  });
  const rawText = await res.text();
  if (aiDebug) {
    console.info('[ai/gptunnel] response', { status: res.status, body_chars: rawText.length });
  }

  let json: GptunnelAssistantResponse;
  try {
    json = JSON.parse(rawText) as GptunnelAssistantResponse;
  } catch {
    throw new AiAgentError('Ответ GPTunnel не JSON', 'ai_bad_response', {
      status: res.status,
      bodySnippet: rawText.slice(0, 500),
    });
  }

  if (!res.ok) {
    const errMsg =
      typeof json.error === 'object' && json.error && typeof json.error.message === 'string'
        ? json.error.message
        : typeof json.error === 'string'
          ? json.error
          : rawText.slice(0, 400);
    throw new AiAgentError(
      errMsg.includes('Assistant not found')
        ? `Ассистент GPTunnel «${assistantCode}» не найден. Проверьте код в кабинете GPTunnel → Ассистенты (формат вроде ai08158128) и что к нему подключена RAG-база.`
        : `GPTunnel assistant/chat: ${errMsg}`,
      'ai_http_error',
      { status: res.status, bodySnippet: rawText.slice(0, 500) },
    );
  }

  const reply = typeof json.message === 'string' ? json.message.trim() : '';
  if (!reply) {
    throw new AiAgentError('В ответе GPTunnel нет message', 'ai_bad_response', {
      bodySnippet: rawText.slice(0, 500),
    });
  }

  return {
    message: reply,
    model: typeof json.model === 'string' ? json.model : undefined,
    usage: json.usage && typeof json.usage === 'object' ? json.usage : undefined,
  };
}
