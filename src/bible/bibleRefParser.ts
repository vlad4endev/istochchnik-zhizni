import { findBookDefByAlias, type BibleBookDef } from './bibleBookCatalog';

export interface ParsedBibleRef {
  book: BibleBookDef;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
}

/**
 * Parses Russian/English scripture refs like:
 * "Ин 3:16", "Иоанна 3:16-18", "Быт. 1", "1 Кор 13:4-7", "John 3:16".
 */
export function parseBibleRef(raw: string): ParsedBibleRef | null {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  const cleaned = input
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const match = cleaned.match(
    /^((?:\d\s*)?[A-Za-zА-Яа-яЁё.]+(?:\s+[A-Za-zА-Яа-яЁё.]+)?)\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$/u,
  );
  if (!match) return null;

  const bookRaw = match[1].replace(/\./g, '').trim();
  const book = findBookDefByAlias(bookRaw);
  if (!book) return null;

  const chapter = Number(match[2]);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null;

  const verseStart = match[3] != null ? Number(match[3]) : null;
  const verseEnd = match[4] != null ? Number(match[4]) : null;
  if (verseStart != null && (!Number.isInteger(verseStart) || verseStart < 1)) return null;
  if (verseEnd != null && (!Number.isInteger(verseEnd) || verseEnd < (verseStart ?? 1))) return null;

  return { book, chapter, verseStart, verseEnd };
}

export function bibleRefToPath(
  ref: ParsedBibleRef,
  translationCode = 'synodal',
): string {
  const base = `/bible/${encodeURIComponent(translationCode)}/${encodeURIComponent(ref.book.slug)}/${ref.chapter}`;
  if (ref.verseStart != null) {
    return `${base}?v=${ref.verseStart}`;
  }
  return base;
}

export function buildInternalBibleUrl(scripture: string, translationCode = 'synodal'): string {
  const parsed = parseBibleRef(scripture);
  if (!parsed) {
    return `/bible?q=${encodeURIComponent(scripture.trim())}`;
  }
  return bibleRefToPath(parsed, translationCode);
}

/** Pick active verse index from audio timings for currentTime (seconds). */
export function verseFromTimings(
  timings: Array<{ v: number; start: number; end?: number }>,
  currentTime: number,
): number | null {
  if (!Array.isArray(timings) || timings.length === 0) return null;
  const t = Number(currentTime);
  if (!Number.isFinite(t) || t < 0) return null;
  let current: number | null = null;
  for (const item of timings) {
    const start = Number(item.start);
    const end = item.end != null ? Number(item.end) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(start)) continue;
    if (t >= start && t < end) {
      current = item.v;
      break;
    }
    if (t >= start) current = item.v;
  }
  return current;
}
