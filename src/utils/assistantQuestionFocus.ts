import { parseBibleRef, type ParsedBibleRef } from '../bible/bibleRefParser';

/** Разделы базы церкви, которые имеет смысл подкладывать в ответ. */
export type AssistantChurchTopic =
  | 'events'
  | 'services'
  | 'schedule'
  | 'prayer'
  | 'people'
  | 'songs';

export interface AssistantContextPlan {
  /** Короткое приветствие: без справок из базы. */
  greeting: boolean;
  /** Нужен текст Писания (ссылка или поиск стиха) либо богословский вопрос. */
  scripture: boolean;
  /** Личный план чтения и место остановки. */
  reading: boolean;
  church: AssistantChurchTopic[];
  refs: ParsedBibleRef[];
  /** Фраза для поиска по тексту стихов, если явной ссылки нет. */
  verseQuery: string | null;
}

const CHAPTER_SCAN =
  /(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?)?/g;

function refKey(ref: ParsedBibleRef): string {
  return `${ref.book.slug}:${ref.chapter}:${ref.verseStart ?? ''}:${ref.verseEnd ?? ''}`;
}

/**
 * Ссылки внутри фразы: берём число главы и проверяем 1–3 слова сразу перед ним
 * («Объясни Ин 3:16» → Ин 3:16, а не «Объясни Ин»).
 */
export function extractBibleRefsFromText(text: string): ParsedBibleRef[] {
  const source = String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-');
  const out: ParsedBibleRef[] = [];
  const seen = new Set<string>();
  for (const match of source.matchAll(CHAPTER_SCAN)) {
    const index = match.index ?? 0;
    const before = source.slice(Math.max(0, index - 48), index);
    const words = before
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-3);
    if (words.length === 0) continue;
    let parsed: ParsedBibleRef | null = null;
    const chapterBit = match[0].replace(/\s+/g, ' ').trim();
    for (let n = 1; n <= words.length; n += 1) {
      const candidate = `${words.slice(-n).join(' ')} ${chapterBit}`;
      parsed = parseBibleRef(candidate);
      if (parsed) break;
    }
    if (!parsed) continue;
    const key = refKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
    if (out.length >= 4) break;
  }
  return out;
}

function cleanPhrase(raw: string): string {
  return raw
    .replace(/[«»"']/g, '')
    .replace(/[.?!].*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** «найди стих про …» / «где в Библии говорится …», без явной ссылки. */
export function extractVerseSearchQuery(text: string): string | null {
  const source = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!source) return null;
  const patterns = [
    /(?:найди|покажи|подскажи|поищи)\s+(?:мне\s+)?стих(?:и)?\s+(?:про|о|об|на тему)\s+(.{3,120})/i,
    /стих(?:и)?\s+(?:про|о|об)\s+(.{3,120})/i,
    /где\s+(?:в\s+)?(?:библии|писании)\s+(?:говорится|написано|сказано)\s+(?:про|о|об)?\s*(.{3,120})/i,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const phrase = cleanPhrase(String(match?.[1] ?? ''));
    if (phrase.length >= 3) return phrase;
  }
  return null;
}

function isGreeting(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length > 48) return false;
  return /^(привет|здравствуй(те)?|мир вам|добр(ый|ое|ого)\s+(день|вечер|утро)|hello|hi)[.!?\s]*$/i.test(
    t,
  );
}

function churchTopics(text: string): AssistantChurchTopic[] {
  const t = text.toLowerCase().replace(/ё/g, 'е');
  const topics = new Set<AssistantChurchTopic>();
  if (/событ|анонс|мероприят|что будет|ближайш/.test(t)) topics.add('events');
  if (/проповед|богослужен|воскресн|программ[аеуы]\s+служен|кто\s+(ведет|ведёт|проповеду)/.test(t)) {
    topics.add('services');
  }
  if (/расписан|медийк|кто\s+в\s+медиа|\bмедиа\b|кто\s+в\s+музык|музыкальн|кто\s+(играет|поет)/.test(t)) {
    topics.add('schedule');
  }
  if (/молитвенн|нужд|о ком молит|кто сегодня в молитв/.test(t)) topics.add('prayer');
  if (
    /чем занима|участник|кто\s+дежур|кто\s+в\s+(музык|медиа|молитв)|справочник/.test(
      t,
    )
  ) {
    topics.add('people');
  }
  const songOfSolomon = /песн(ь|и)\s+песней|песн\.?\s*\d/.test(t);
  if (!songOfSolomon && /песенник|гимн|аккорд|текст песни|слова песни|какая песня|песн[яию]/.test(t)) {
    topics.add('songs');
  }
  return [...topics];
}

function wantsScripture(text: string, refs: ParsedBibleRef[], verseQuery: string | null): boolean {
  if (refs.length > 0 || verseQuery) return true;
  return /библи|стих|писани|евангел|отрывок|цитат|глав[аеуы]\s*\d/i.test(text);
}

function wantsReading(text: string): boolean {
  return /план\s+чтени|что\s+(?:мне\s+|нам\s+)?читать|где\s+я\s+(остановил|читал|читаю)|на\s+ч[её]м\s+я\s+остановил|мой\s+прогресс|чтение\s+библи|следующ(?:ий|ее)\s+(?:день|отрывок)|что\s+дальше\s+читать/i.test(
    text,
  );
}

/**
 * Что подложить в контекст ИИ. Вопрос о вере не тащит весь справочник церкви,
 * вопрос о служении не подменяет ответ случайным каталогом песен.
 */
export function planAssistantContext(text: string): AssistantContextPlan {
  const source = String(text ?? '').trim();
  const refs = extractBibleRefsFromText(source);
  const verseQuery = refs.length > 0 ? null : extractVerseSearchQuery(source);
  const church = churchTopics(source);
  const reading = wantsReading(source);
  const scripture = wantsScripture(source, refs, verseQuery);
  if (isGreeting(source) && refs.length === 0 && !reading && church.length === 0 && !verseQuery) {
    return { greeting: true, scripture: false, reading: false, church: [], refs: [], verseQuery: null };
  }
  const faithFallback = !scripture && !reading && church.length === 0;
  return {
    greeting: false,
    scripture: scripture || faithFallback,
    reading,
    church,
    refs,
    verseQuery,
  };
}

/** Хвост диалога оставляем длиннее, старые реплики сжимаем. */
export function clipAssistantTurn(content: string, turnsFromEnd: number): string {
  const limit = turnsFromEnd <= 3 ? 6000 : 1500;
  return String(content ?? '').slice(0, limit);
}
