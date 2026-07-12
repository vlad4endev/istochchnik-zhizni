import { spawn } from 'child_process';

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
  /** OpenAI-совместимый JSON-режим ответа */
  response_format?: { type: 'json_object' };
}

type OpenAiCompatResponse = {
  choices?: {
    message?: {
      content?: string | null | Array<{ type?: string; text?: string }>;
    };
  }[];
  error?: { message?: string } | string;
  success?: boolean;
};

type LlmHttpResult = {
  status: number;
  ok: boolean;
  rawText: string;
};

function parseProviderError(json: OpenAiCompatResponse, rawText: string): string {
  const err = json.error;
  if (typeof err === 'object' && err && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim();
  }
  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }
  return rawText.slice(0, 400);
}

function isCloudflareSecurityPolicyBlock(status: number, rawText: string): boolean {
  return status === 403 && /Access denied by security policy/i.test(rawText);
}

function formatHttpError(status: number, hint: string, rawText: string, baseUrl: string): string {
  if (isCloudflareSecurityPolicyBlock(status, rawText)) {
    const provider = baseUrl.includes('openrouter.ai') ? 'OpenRouter' : 'провайдером ИИ';
    return (
      `Запрос к ${provider} заблокирован защитой Cloudflare (это не ошибка API-ключа). ` +
      'Рекомендуется: Админка → Интеграции → ИИ → провайдер «DeepSeek» или «OpenAI», вставить ключ, сохранить и включить ИИ. ' +
      'OpenRouter часто блокирует IP сервера (VPS/хостинг).'
    );
  }
  return hint || `HTTP ${status}`;
}

function shouldPreferCurlTransport(baseUrl: string): boolean {
  const mode = (typeof process.env.AI_HTTP_TRANSPORT === 'string' ? process.env.AI_HTTP_TRANSPORT : '')
    .trim()
    .toLowerCase();
  if (mode === 'curl') return true;
  if (mode === 'fetch') return false;
  return baseUrl.includes('openrouter.ai');
}

type CurlProfile = {
  userAgent: string;
  extraArgs: string[];
};

const CURL_PROFILES: CurlProfile[] = [
  { userAgent: 'curl/8.5.0', extraArgs: ['--http1.1', '--compressed'] },
  {
    userAgent:
      'Mozilla/5.0 (compatible; IstochnikZhizni/1.0; +https://istochik-zhizni.local)',
    extraArgs: ['--http1.1', '--compressed', '--tlsv1.2'],
  },
];

async function postViaCurlProfile(
  url: string,
  headers: Record<string, string>,
  body: string,
  profile: CurlProfile,
): Promise<LlmHttpResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--max-time',
      '300',
      '-A',
      profile.userAgent,
      ...profile.extraArgs,
      '-w',
      '\n%{http_code}',
      '-X',
      'POST',
      '-H',
      'Accept: application/json',
      ...Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]),
      '--data-binary',
      '@-',
      url,
    ];
    const child = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl exited with code ${code ?? 'unknown'}`));
        return;
      }
      const lastNewline = stdout.lastIndexOf('\n');
      if (lastNewline < 0) {
        reject(new Error('curl response missing status line'));
        return;
      }
      const rawText = stdout.slice(0, lastNewline);
      const status = Number.parseInt(stdout.slice(lastNewline + 1).trim(), 10);
      resolve({
        status: Number.isFinite(status) ? status : 0,
        ok: Number.isFinite(status) && status >= 200 && status < 300,
        rawText,
      });
    });
    child.stdin.end(body);
  });
}

async function postViaCurl(url: string, headers: Record<string, string>, body: string): Promise<LlmHttpResult> {
  let last: LlmHttpResult | null = null;
  for (const profile of CURL_PROFILES) {
    const result = await postViaCurlProfile(url, headers, body, profile);
    last = result;
    if (result.ok || !isCloudflareSecurityPolicyBlock(result.status, result.rawText)) {
      return result;
    }
  }
  return last ?? { status: 0, ok: false, rawText: '' };
}

async function postLlmRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  baseUrl: string,
  aiDebug: boolean,
): Promise<LlmHttpResult> {
  if (shouldPreferCurlTransport(baseUrl)) {
    if (aiDebug) {
      console.info('[ai] transport', { mode: 'curl', url });
    }
    try {
      return await postViaCurl(url, headers, body);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[ai] curl transport unavailable for OpenRouter:', msg);
      throw new AiAgentError(
        'На сервере недоступен curl для запросов к OpenRouter. Установите curl или выберите провайдер DeepSeek/OpenAI в админке.',
        'ai_http_error',
      );
    }
  }

  const res = await fetch(url, { method: 'POST', headers, body });
  const rawText = await res.text();
  const result: LlmHttpResult = { status: res.status, ok: res.ok, rawText };

  if (!res.ok && isCloudflareSecurityPolicyBlock(res.status, rawText)) {
    if (aiDebug) {
      console.info('[ai] cloudflare block detected, retrying via curl', { url });
    }
    try {
      return await postViaCurl(url, headers, body);
    } catch (e) {
      if (aiDebug) {
        console.warn('[ai] curl retry failed', e);
      }
    }
  }

  return result;
}

function extractMessageContent(
  content: string | null | Array<{ type?: string; text?: string }> | undefined,
): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts = content
    .map((part) => (part?.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

function buildLlmHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (baseUrl.includes('openrouter.ai')) {
    const referer =
      (typeof process.env.OPENROUTER_HTTP_REFERER === 'string' && process.env.OPENROUTER_HTTP_REFERER.trim()) ||
      (typeof process.env.PUBLIC_APP_URL === 'string' && process.env.PUBLIC_APP_URL.trim()) ||
      'https://istochik-zhizni.local';
    const title =
      (typeof process.env.OPENROUTER_APP_TITLE === 'string' && process.env.OPENROUTER_APP_TITLE.trim()) ||
      'Istochnik Zhizni Songbook';
    headers['HTTP-Referer'] = referer;
    headers['X-Title'] = title;
  }
  return headers;
}

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
  const headers = buildLlmHeaders(baseUrl, apiKey);
  const body = JSON.stringify({
    model,
    messages: msgs,
    temperature,
    max_tokens,
    ...(options.response_format ? { response_format: options.response_format } : {}),
  });
  const http = await postLlmRequest(url, headers, body, baseUrl, aiDebug);
  const rawText = http.rawText;
  if (aiDebug) {
    console.info('[ai] response', {
      status: http.status,
      ok: http.ok,
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
      { status: http.status, bodySnippet: rawText.slice(0, 500) },
    );
  }

  if (!http.ok) {
    const hint = parseProviderError(json, rawText);
    if (isCloudflareSecurityPolicyBlock(http.status, rawText)) {
      console.error('[ai] cloudflare security policy block', {
        base_url: baseUrl,
        status: http.status,
      });
    }
    throw new AiAgentError(
      formatHttpError(http.status, hint, rawText, baseUrl),
      'ai_http_error',
      { status: http.status, bodySnippet: rawText.slice(0, 500) },
    );
  }

  const content = extractMessageContent(json.choices?.[0]?.message?.content);
  if (!content) {
    throw new AiAgentError('В ответе нет choices[0].message.content', 'ai_bad_response', {
      bodySnippet: rawText.slice(0, 500),
    });
  }
  return content;
}
