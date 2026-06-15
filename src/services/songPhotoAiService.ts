import { AiAgentError, chatCompletion } from '../ai';
import { loadAiSettingsDocument, resolveLlmRuntimeConfig } from '../services/aiSettingsService';

const DEFAULT_PHOTO_MODEL_FALLBACKS = [
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
] as const;

function isLikelyVisionModel(model: string): boolean {
  return /gemini|gpt-4o|claude-3|claude-3\.5|pixtral|llava|vision/i.test(model);
}

function buildPhotoModelCandidates(defaultModel: string): string[] {
  const envModel =
    typeof process.env.SONG_PHOTO_AI_MODEL === 'string' ? process.env.SONG_PHOTO_AI_MODEL.trim() : '';
  const out: string[] = [];
  const push = (m: string) => {
    const t = m.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (envModel) push(envModel);
  if (defaultModel.trim() && isLikelyVisionModel(defaultModel)) push(defaultModel);
  for (const m of DEFAULT_PHOTO_MODEL_FALLBACKS) push(m);
  return out;
}

async function resolvePhotoVisionConfig(): Promise<{ base_url: string; api_key: string; models: string[] }> {
  const [doc, cfg] = await Promise.all([loadAiSettingsDocument(), resolveLlmRuntimeConfig()]);
  const api_key = cfg.api_key;
  if (!api_key) {
    throw new AiAgentError(
      'В настройках интеграции ИИ не найден API-ключ. Откройте раздел интеграций и сохраните ключ ещё раз.',
      'ai_not_configured',
    );
  }
  const base_url = cfg.base_url.replace(/\/+$/, '');
  const models = buildPhotoModelCandidates(cfg.default_model);
  if (process.env.AI_DEBUG === '1') {
    console.info('[songPhotoAi] vision config', {
      enabled: doc.enabled,
      connection_preset: doc.connection_preset,
      base_url,
      default_model: cfg.default_model,
      models,
      has_api_key: Boolean(api_key),
    });
  }
  return { base_url, api_key, models };
}

export type SongPhotoAiResult = {
  title: string | null;
  chordPro: string;
};

function stripMarkdownFences(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim();
}

function normalizeMimeType(mime: string): string {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? 'image/jpeg';
  if (m === 'image/jpg') return 'image/jpeg';
  return m.startsWith('image/') ? m : 'image/jpeg';
}

function ensureSectionHeaders(chordPro: string): string {
  let out = chordPro.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!out) return out;
  if (!/\{sec:/i.test(out) && !/\{section:/i.test(out)) {
    out = `{sec:Куплет 1}\n${out}`;
  }
  return out;
}

function unescapeJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function extractChordProFromLooseJson(raw: string): { title: string | null; chordPro: string } | null {
  const text = stripMarkdownFences(raw);
  const titleMatch = /"title"\s*:\s*(null|"([^"\\]|\\.)*")/i.exec(text);
  const chordMatch = /"chordPro"\s*:\s*"((?:[^"\\]|\\.)*)"/is.exec(text);
  if (!chordMatch?.[1]) return null;
  const chordPro = unescapeJsonString(chordMatch[1]);
  let title: string | null = null;
  if (titleMatch?.[1] && titleMatch[1] !== 'null') {
    const t = titleMatch[1].replace(/^"|"$/g, '');
    title = unescapeJsonString(t).trim() || null;
  }
  return { title, chordPro };
}

function tryParseJsonPayload(raw: string): { title?: unknown; chordPro?: unknown } | null {
  const trimmed = stripMarkdownFences(raw).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as { title?: unknown; chordPro?: unknown };
  } catch {
    const loose = extractChordProFromLooseJson(trimmed);
    if (loose) {
      return { title: loose.title, chordPro: loose.chordPro };
    }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice) as { title?: unknown; chordPro?: unknown };
      } catch {
        const looseSlice = extractChordProFromLooseJson(slice);
        if (looseSlice) {
          return { title: looseSlice.title, chordPro: looseSlice.chordPro };
        }
      }
    }
    return null;
  }
}

const SYSTEM_PROMPT = [
  'Ты помощник песенника церкви. По фотографии листа с текстом песни и аккордами извлеки содержимое и подготовь ChordPro для редактора.',
  '',
  'Ответ — ТОЛЬКО валидный JSON без markdown и пояснений:',
  '{"title": string|null, "chordPro": string}',
  '',
  'Поле title — название песни, если видно на фото; иначе null.',
  'Поле chordPro — полный текст в формате ChordPro (экранируй переносы строк как \\n внутри JSON-строки):',
  '- Каждая секция начинается строкой {sec:НАЗВАНИЕ} (Куплет 1, Припев, Бридж, Интро, Предприпев, Соло, Аутро и т.д.).',
  '- Аккорды встраивай в строки как [Am], [G/B], [F#m7] прямо над соответствующими слогами/словами.',
  '- Если на фото аккорды отдельной строкой над текстом — перенеси их в ChordPro в ту же строку с текстом.',
  '- Сохраняй переносы строк и порядок куплетов/припевов как на фото.',
  '- Определи начало песни (интро/куплет 1) по контексту и заголовкам на листе.',
  '- Не выдумывай слова и аккорды, которых нет на изображении.',
  '- Не исправляй орфографию.',
  '- Используй латиницу для обозначений аккордов (Am, Bb, C#m и т.д.).',
].join('\n');

async function callVisionModel(
  vision: { base_url: string; api_key: string },
  model: string,
  dataUrl: string,
): Promise<string> {
  return chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Распознай песню с этого фото: текст, аккорды, секции. Верни JSON {title, chordPro}.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'auto' },
          },
        ],
      },
    ],
    {
      model,
      base_url: vision.base_url,
      api_key: vision.api_key,
      temperature: 0.1,
      max_tokens: 8000,
      skipSystemPrompt: true,
    },
  );
}

function parseVisionReply(reply: string): SongPhotoAiResult {
  const parsed = tryParseJsonPayload(reply);
  let title: string | null = null;
  let chordPro = '';

  if (parsed && typeof parsed.chordPro === 'string') {
    chordPro = ensureSectionHeaders(parsed.chordPro);
    if (typeof parsed.title === 'string' && parsed.title.trim()) {
      title = parsed.title.trim();
    }
  } else {
    const loose = extractChordProFromLooseJson(reply);
    if (loose?.chordPro?.trim()) {
      chordPro = ensureSectionHeaders(loose.chordPro);
      title = loose.title;
    } else {
      chordPro = ensureSectionHeaders(stripMarkdownFences(String(reply ?? '')));
    }
  }

  if (!chordPro.trim()) {
    throw new AiAgentError(
      'ИИ не смог распознать текст на фото. Попробуйте более чёткий снимок или другое освещение.',
      'ai_bad_response',
    );
  }

  return { title, chordPro };
}

export async function recognizeSongFromPhoto(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<SongPhotoAiResult> {
  if (!imageBuffer.length) {
    throw new Error('Пустой файл изображения');
  }
  if (imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Изображение больше 10 МБ');
  }

  const vision = await resolvePhotoVisionConfig();
  const mime = normalizeMimeType(mimeType);
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;

  let lastError: unknown = null;
  for (const model of vision.models) {
    try {
      const reply = await callVisionModel(
        { base_url: vision.base_url, api_key: vision.api_key },
        model,
        dataUrl,
      );
      return parseVisionReply(reply);
    } catch (e) {
      lastError = e;
      const retryable =
        e instanceof AiAgentError &&
        (e.code === 'ai_http_error' || e.code === 'ai_bad_response') &&
        (e.status === 404 || e.status === 400 || e.status === 422 || e.status === 502 || e.status === 503);
      if (!retryable) break;
      console.warn('[songPhotoAi] model failed, trying fallback', {
        model,
        message: e instanceof Error ? e.message : e,
      });
    }
  }

  if (lastError instanceof AiAgentError) throw lastError;
  if (lastError instanceof Error) throw lastError;
  throw new AiAgentError(
    'Не удалось распознать фото. Проверьте, что в интеграции ИИ выбрана vision-модель (Gemini / GPT-4o).',
    'ai_http_error',
  );
}

export { AiAgentError };
