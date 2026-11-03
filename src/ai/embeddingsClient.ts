import { resolveLlmRuntimeConfig } from '../services/aiSettingsService';
import { AiAgentError } from './llmClient';

const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const AI_KNOWLEDGE_EMBEDDING_DIMS = 1536;

type EmbeddingsResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string } | string;
};

function parseError(json: EmbeddingsResponse, rawText: string): string {
  const err = json.error;
  if (typeof err === 'object' && err && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim();
  }
  if (typeof err === 'string' && err.trim()) return err.trim();
  return rawText.slice(0, 400) || 'Неизвестная ошибка embeddings API';
}

export function embeddingToPgVectorLiteral(values: number[]): string {
  if (!Array.isArray(values) || values.length === 0) {
    throw new AiAgentError('Пустой embedding-вектор', 'ai_bad_response');
  }
  return `[${values.map((n) => (Number.isFinite(n) ? n : 0)).join(',')}]`;
}

/**
 * OpenAI-совместимый `POST {base_url}/embeddings`.
 * Модель: options.model → AI settings `embedding_model` → text-embedding-3-small.
 */
export async function embedTexts(
  texts: string[],
  options: { model?: string } = {},
): Promise<number[][]> {
  const cleaned = texts.map((t) => String(t ?? '').trim()).filter((t) => t.length > 0);
  if (cleaned.length === 0) return [];

  const cfg = await resolveLlmRuntimeConfig();
  if (!cfg.enabled) {
    throw new AiAgentError('Модуль ИИ отключён в настройках.', 'ai_disabled');
  }
  if (!cfg.api_key) {
    throw new AiAgentError(
      'Не задан API-ключ (админка или AI_API_KEY / OPENAI_API_KEY).',
      'ai_not_configured',
    );
  }

  const model =
    (typeof options.model === 'string' && options.model.trim()) ||
    cfg.embedding_model ||
    DEFAULT_EMBEDDING_MODEL;
  const baseUrl = cfg.base_url.replace(/\/+$/, '');
  const url = `${baseUrl}/embeddings`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.api_key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      input: cleaned.length === 1 ? cleaned[0] : cleaned,
    }),
  });
  const rawText = await res.text();
  let json: EmbeddingsResponse = {};
  try {
    json = rawText ? (JSON.parse(rawText) as EmbeddingsResponse) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new AiAgentError(parseError(json, rawText), 'ai_http_error', {
      status: res.status,
      bodySnippet: rawText.slice(0, 400),
    });
  }

  const rows = Array.isArray(json.data) ? [...json.data] : [];
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (rows.length !== cleaned.length) {
    throw new AiAgentError(
      `Embeddings API вернул ${rows.length} векторов вместо ${cleaned.length}`,
      'ai_bad_response',
      { bodySnippet: rawText.slice(0, 400) },
    );
  }

  return rows.map((row, i) => {
    const emb = row.embedding;
    if (!Array.isArray(emb) || emb.length === 0) {
      throw new AiAgentError(`Пустой embedding для фрагмента #${i}`, 'ai_bad_response');
    }
    if (emb.length !== AI_KNOWLEDGE_EMBEDDING_DIMS) {
      throw new AiAgentError(
        `Ожидалась размерность embedding ${AI_KNOWLEDGE_EMBEDDING_DIMS}, получено ${emb.length}. ` +
          `Используйте модель text-embedding-3-small (или совместимую с 1536 dims).`,
        'ai_bad_response',
      );
    }
    return emb.map((n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0));
  });
}

export async function embedQuery(text: string, options: { model?: string } = {}): Promise<number[]> {
  const [vec] = await embedTexts([text], options);
  if (!vec) {
    throw new AiAgentError('Не удалось получить embedding запроса', 'ai_bad_response');
  }
  return vec;
}
