import { AiAgentError, chatCompletion } from '../ai';
import { resolveLlmRuntimeConfig } from '../services/aiSettingsService';
import { getPresetDefaults } from '../types/aiConnectionPresets';

const OPENROUTER_BASE = getPresetDefaults('openrouter').base_url;
const DEFAULT_PHOTO_MODEL =
  (typeof process.env.SONG_PHOTO_AI_MODEL === 'string' ? process.env.SONG_PHOTO_AI_MODEL.trim() : '') ||
  'google/gemini-3.1-pro-preview';

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

function tryParseJsonPayload(raw: string): { title?: unknown; chordPro?: unknown } | null {
  const trimmed = stripMarkdownFences(raw).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as { title?: unknown; chordPro?: unknown };
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as { title?: unknown; chordPro?: unknown };
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function resolveOpenRouterVisionConfig(): Promise<{ base_url: string; api_key: string; model: string }> {
  const cfg = await resolveLlmRuntimeConfig();
  const openrouterKey =
    (typeof process.env.OPENROUTER_API_KEY === 'string' ? process.env.OPENROUTER_API_KEY.trim() : '') || null;
  const onOpenRouter = cfg.base_url.includes('openrouter.ai');
  const api_key = openrouterKey || (onOpenRouter ? cfg.api_key : null);
  if (!api_key) {
    throw new AiAgentError(
      'Для распознавания фото нужен OpenRouter: выберите пресет OpenRouter в настройках ИИ или задайте OPENROUTER_API_KEY.',
      'ai_not_configured',
    );
  }
  return {
    base_url: OPENROUTER_BASE,
    api_key,
    model: DEFAULT_PHOTO_MODEL,
  };
}

const SYSTEM_PROMPT = [
  'Ты помощник песенника церкви. По фотографии листа с текстом песни и аккордами извлеки содержимое и подготовь ChordPro для редактора.',
  '',
  'Ответ — ТОЛЬКО валидный JSON без markdown и пояснений:',
  '{"title": string|null, "chordPro": string}',
  '',
  'Поле title — название песни, если видно на фото; иначе null.',
  'Поле chordPro — полный текст в формате ChordPro:',
  '- Каждая секция начинается строкой {sec:НАЗВАНИЕ} (Куплет 1, Припев, Бридж, Интро, Предприпев, Соло, Аутро и т.д.).',
  '- Аккорды встраивай в строки как [Am], [G/B], [F#m7] прямо над соответствующими слогами/словами.',
  '- Если на фото аккорды отдельной строкой над текстом — перенеси их в ChordPro в ту же строку с текстом.',
  '- Сохраняй переносы строк и порядок куплетов/припевов как на фото.',
  '- Определи начало песни (интро/куплет 1) по контексту и заголовкам на листе.',
  '- Не выдумывай слова и аккорды, которых нет на изображении.',
  '- Не исправляй орфографию.',
  '- Используй латиницу для обозначений аккордов (Am, Bb, C#m и т.д.).',
].join('\n');

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

  const vision = await resolveOpenRouterVisionConfig();
  const mime = normalizeMimeType(mimeType);
  const dataUrl = `data:${mime};base64,${imageBuffer.toString('base64')}`;

  const reply = await chatCompletion(
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
            image_url: { url: dataUrl, detail: 'high' },
          },
        ],
      },
    ],
    {
      model: vision.model,
      base_url: vision.base_url,
      api_key: vision.api_key,
      temperature: 0.1,
      max_tokens: 8000,
      skipSystemPrompt: true,
    },
  );

  const parsed = tryParseJsonPayload(reply);
  let title: string | null = null;
  let chordPro = '';

  if (parsed && typeof parsed.chordPro === 'string') {
    chordPro = ensureSectionHeaders(parsed.chordPro);
    if (typeof parsed.title === 'string' && parsed.title.trim()) {
      title = parsed.title.trim();
    }
  } else {
    chordPro = ensureSectionHeaders(stripMarkdownFences(String(reply ?? '')));
  }

  if (!chordPro.trim()) {
    throw new AiAgentError(
      'ИИ не смог распознать текст на фото. Попробуйте более чёткий снимок или другое освещение.',
      'ai_bad_response',
    );
  }

  return { title, chordPro };
}

export { AiAgentError };
