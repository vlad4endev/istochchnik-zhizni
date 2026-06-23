import { AiAgentError, chatCompletion } from '../ai';
import { loadAiSettingsDocument, resolveLlmRuntimeConfig } from '../services/aiSettingsService';

const DEFAULT_VISION_MODEL_FALLBACKS = [
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-3.1-pro-preview',
  'google/gemini-3-flash-preview',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
] as const;

export type RecognizedSectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'section';

export type RecognizedSection = {
  type: RecognizedSectionType;
  label: string;
  bars?: number | null;
  chords: string[];
  lyricHint?: string | null;
};

export type RecognizedSong = {
  title?: string | null;
  composer?: string | null;
  key?: string | null;
  timeSignature?: string | null;
  bpm?: number | null;
  tempo?: string | null;
  sections: RecognizedSection[];
  generalNotes: string;
};

function isLikelyVisionModel(model: string): boolean {
  return /gemini|gpt-4o|claude-3|claude-3\.5|pixtral|llava|vision/i.test(model);
}

function buildVisionModelCandidates(defaultModel: string): string[] {
  const envModel =
    typeof process.env.SHEET_MUSIC_AI_MODEL === 'string'
      ? process.env.SHEET_MUSIC_AI_MODEL.trim()
      : typeof process.env.SONG_PHOTO_AI_MODEL === 'string'
        ? process.env.SONG_PHOTO_AI_MODEL.trim()
        : '';
  const out: string[] = [];
  const push = (m: string) => {
    const t = m.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  if (envModel) push(envModel);
  if (defaultModel.trim() && isLikelyVisionModel(defaultModel)) push(defaultModel);
  for (const m of DEFAULT_VISION_MODEL_FALLBACKS) push(m);
  return out;
}

async function resolveVisionConfig(): Promise<{ base_url: string; api_key: string; models: string[] }> {
  const [doc, cfg] = await Promise.all([loadAiSettingsDocument(), resolveLlmRuntimeConfig()]);
  const api_key = cfg.api_key;
  if (!api_key) {
    throw new AiAgentError(
      'В настройках интеграции ИИ не найден API-ключ. Откройте раздел интеграций и сохраните ключ ещё раз.',
      'ai_not_configured',
    );
  }
  const base_url = cfg.base_url.replace(/\/+$/, '');
  const models = buildVisionModelCandidates(cfg.default_model);
  if (process.env.AI_DEBUG === '1') {
    console.info('[sheetMusicAi] vision config', {
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

function normalizeMimeType(mime: string): string {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? 'image/jpeg';
  if (m === 'image/jpg') return 'image/jpeg';
  return m.startsWith('image/') ? m : 'image/jpeg';
}

function stripMarkdownFences(text: string): string {
  const t = text.trim();
  const jsonMatch = t.match(/```json\s*([\s\S]*?)```/i) ?? t.match(/```\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) return jsonMatch[1].trim();
  if (t.startsWith('```')) {
    return t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim();
  }
  return t;
}

function normalizeSectionType(raw: unknown): RecognizedSectionType {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (t === 'intro' || t === 'verse' || t === 'chorus' || t === 'bridge' || t === 'outro' || t === 'section') {
    return t;
  }
  return 'section';
}

function normalizeRecognizedSong(raw: unknown): RecognizedSong {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : [];
  const sections: RecognizedSection[] = sectionsRaw.map((item) => {
    const s = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const chordsRaw = Array.isArray(s.chords) ? s.chords : [];
    const chords = chordsRaw
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter(Boolean);
    const bars =
      typeof s.bars === 'number' && Number.isFinite(s.bars) ? Math.round(s.bars) : null;
    return {
      type: normalizeSectionType(s.type),
      label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : 'Секция',
      bars,
      chords,
      lyricHint:
        typeof s.lyricHint === 'string' && s.lyricHint.trim() ? s.lyricHint.trim() : null,
    };
  });

  const bpmRaw = obj.bpm;
  const bpm =
    typeof bpmRaw === 'number' && Number.isFinite(bpmRaw) && bpmRaw > 0 && bpmRaw <= 400
      ? Math.round(bpmRaw)
      : null;

  return {
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : null,
    composer: typeof obj.composer === 'string' && obj.composer.trim() ? obj.composer.trim() : null,
    key: typeof obj.key === 'string' && obj.key.trim() ? obj.key.trim() : null,
    timeSignature:
      typeof obj.timeSignature === 'string' && obj.timeSignature.trim()
        ? obj.timeSignature.trim()
        : null,
    bpm,
    tempo: typeof obj.tempo === 'string' && obj.tempo.trim() ? obj.tempo.trim() : null,
    sections,
    generalNotes:
      typeof obj.generalNotes === 'string' && obj.generalNotes.trim()
        ? obj.generalNotes.trim()
        : '',
  };
}

const SYSTEM_PROMPT = [
  'Ты — профессиональный музыкальный транскрипер.',
  'Тебе дают фотографию нотного листа или партитуры (возможно, снятой вживую, немного под углом или с бликами).',
  '',
  'Твоя задача — извлечь максимум структурированной информации.',
  '',
  'Верни ТОЛЬКО валидный JSON без лишнего текста, строго по этой схеме:',
  '{',
  '  "title": "название произведения или null",',
  '  "composer": "автор или null",',
  '  "key": "тональность (например Am, G, F#m) или null",',
  '  "timeSignature": "размер (например 4/4, 3/4, 6/8) или null",',
  '  "bpm": число или null,',
  '  "tempo": "темповое обозначение (Andante, Allegro и т.д.) или null",',
  '  "sections": [',
  '    {',
  '      "type": "intro | verse | chorus | bridge | outro | section",',
  '      "label": "человекочитаемое название секции",',
  '      "bars": число тактов или null,',
  '      "chords": ["список", "аккордов", "в", "секции"],',
  '      "lyricHint": "первые слова текста строки если видны, иначе null"',
  '    }',
  '  ],',
  '  "generalNotes": "любые важные замечания: динамика, артикуляция, ключевые знаки, повторы, da capo и т.д."',
  '}',
  '',
  'Если информация нечёткая — делай лучшее предположение и укажи в generalNotes.',
  'Если текст на фото не по-русски — всё равно верни JSON на русском (label, generalNotes).',
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
            type: 'image_url',
            image_url: { url: dataUrl, detail: 'auto' },
          },
          {
            type: 'text',
            text: 'Распознай эту партитуру и верни JSON.',
          },
        ],
      },
    ],
    {
      model,
      base_url: vision.base_url,
      api_key: vision.api_key,
      temperature: 0.1,
      max_tokens: 2000,
      skipSystemPrompt: true,
      response_format: { type: 'json_object' },
    },
  );
}

function parseVisionReply(reply: string): RecognizedSong {
  const trimmed = stripMarkdownFences(reply);
  if (!trimmed) {
    throw new AiAgentError(
      'ИИ не смог распознать партитуру. Попробуйте более чёткий снимок.',
      'ai_bad_response',
    );
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return normalizeRecognizedSong(parsed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return normalizeRecognizedSong(JSON.parse(trimmed.slice(start, end + 1)));
      } catch {
        // fall through
      }
    }
    throw new AiAgentError(
      `Не удалось распарсить ответ модели: ${trimmed.slice(0, 280)}`,
      'ai_bad_response',
    );
  }
}

export async function recognizeSheetMusic(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<RecognizedSong> {
  if (!imageBuffer.length) {
    throw new Error('Пустой файл изображения');
  }
  if (imageBuffer.length > 10 * 1024 * 1024) {
    throw new Error('Изображение больше 10 МБ');
  }

  const vision = await resolveVisionConfig();
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
      console.warn('[sheetMusicAi] model failed, trying fallback', {
        model,
        message: e instanceof Error ? e.message : e,
      });
    }
  }

  if (lastError instanceof AiAgentError) throw lastError;
  if (lastError instanceof Error) throw lastError;
  throw new AiAgentError(
    'Не удалось распознать партитуру. Проверьте, что в интеграции ИИ выбрана vision-модель (Gemini / GPT-4o).',
    'ai_http_error',
  );
}

export { AiAgentError };
