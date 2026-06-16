import { AiAgentError, chatCompletion } from '../ai';

function normalizeNewlines(input: string): string {
  return (typeof input === 'string' ? input : '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stripMarkdownFences(text: string): string {
  const t = text.trim();
  if (!t.startsWith('```')) return t;
  return t.replace(/^```[a-zA-Z0-9_-]*\s*\n?/u, '').replace(/\n?```$/u, '').trim();
}

function ensureSectionHeaders(text: string): string {
  const normalized = normalizeNewlines(text).trim();
  if (!normalized) return normalized;
  if (!/\{sec:/i.test(normalized) && !/\{section:/i.test(normalized)) {
    return `{sec:Куплет 1}\n${normalized}`;
  }
  return normalized;
}

export type StudioAiCleanupResult = {
  chordPro: string;
};

const CLEANUP_SYSTEM_PROMPT = [
  'Ты помощник песенника церкви. Приведи текст песни в чистый рабочий ChordPro-формат для музыкантов.',
  '',
  'ВАЖНО: Ответ — ТОЛЬКО чистый ChordPro-текст, без Markdown, без JSON, без пояснений.',
  '',
  'Что нужно сделать:',
  '1) УДАЛИТЬ всё, что не является текстом песни:',
  '   — ссылки (http/https), домены сайтов, email;',
  '   — указания источника («Источник:», «С сайта», «holychords», «kgmusic», «worshiptogether» и т.п.);',
  '   — копирайты, номера страниц, водяные знаки, рекламу;',
  '   — примечания автора/редактора, переводческие сноски, теги жанра;',
  '   — повторяющиеся пустые строки и мусорные символы.',
  '2) СОХРАНИТЬ все слова песни (куплеты, припев, бридж и т.д.) — не переписывай, не «улучшай» стихи.',
  '3) АККОРДЫ:',
  '   — приведи к формату ChordPro в квадратных скобках: [Am], [G/B], [F#m7];',
  '   — если аккорды стоят отдельной строкой над текстом — встрой их в строку текста в правильные позиции;',
  '   — не выдумывай аккорды, если их нет в исходнике.',
  '4) СТРУКТУРА: разметь секции директивами {sec:НАЗВАНИЕ} на отдельной строке перед блоком:',
  '   — Интро / Вступление, Куплет 1, Куплет 2, …, Предприпев, Припев, Бридж / Мост, Соло, Аутро / Финал;',
  '   — нумеруй куплеты последовательно;',
  '   — повторяющийся блок без заголовка — {sec:Припев}.',
  '',
  'Правила:',
  '— Сохраняй переносы строк внутри секций.',
  '— Не добавляй новых слов песни.',
  '— Не исправляй орфографию и пунктуацию слов песни.',
].join('\n');

export async function cleanupSongWithAi(content: string): Promise<StudioAiCleanupResult> {
  const source = normalizeNewlines(content).trim();
  if (!source) {
    return { chordPro: '' };
  }
  if (source.length > 120_000) {
    throw new Error('Слишком большой текст для ИИ. Уменьшите объём и попробуйте снова.');
  }

  const reply = await chatCompletion(
    [
      { role: 'system', content: CLEANUP_SYSTEM_PROMPT },
      { role: 'user', content: source },
    ],
    {
      section: 'studio',
      temperature: 0.2,
      max_tokens: 8000,
      skipSystemPrompt: true,
    },
  );

  let out = ensureSectionHeaders(stripMarkdownFences(String(reply ?? '')));
  if (!out.trim()) {
    throw new Error('ИИ вернул пустой ответ. Попробуйте ещё раз.');
  }

  return { chordPro: out };
}

export { AiAgentError };
