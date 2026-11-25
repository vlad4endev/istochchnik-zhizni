export type VerseOfDayRef = {
  book: string;
  chapter: number;
  verse: number;
  /** Для диапазона стихов (включительно). */
  end?: number;
};

/**
 * Отобранные ободряющие стихи для карточки «Стих дня».
 * Ссылки — в синодальной нумерации (псалмы со сдвигом относительно английской).
 */
export const VERSE_OF_DAY_LIST: VerseOfDayRef[] = [
  { book: 'genesis', chapter: 1, verse: 1 },
  { book: 'numbers', chapter: 6, verse: 24, end: 25 },
  { book: 'deuteronomy', chapter: 6, verse: 5 },
  { book: 'joshua', chapter: 1, verse: 9 },
  { book: 'job', chapter: 19, verse: 25 },
  { book: 'psalms', chapter: 1, verse: 1, end: 2 },
  { book: 'psalms', chapter: 22, verse: 1 },
  { book: 'psalms', chapter: 22, verse: 4 },
  { book: 'psalms', chapter: 26, verse: 1 },
  { book: 'psalms', chapter: 31, verse: 8 },
  { book: 'psalms', chapter: 36, verse: 5 },
  { book: 'psalms', chapter: 41, verse: 2 },
  { book: 'psalms', chapter: 50, verse: 12 },
  { book: 'psalms', chapter: 54, verse: 23 },
  { book: 'psalms', chapter: 62, verse: 2 },
  { book: 'psalms', chapter: 72, verse: 26 },
  { book: 'psalms', chapter: 90, verse: 1, end: 2 },
  { book: 'psalms', chapter: 90, verse: 11 },
  { book: 'psalms', chapter: 99, verse: 5 },
  { book: 'psalms', chapter: 102, verse: 1 },
  { book: 'psalms', chapter: 118, verse: 105 },
  { book: 'psalms', chapter: 118, verse: 114 },
  { book: 'psalms', chapter: 120, verse: 1, end: 2 },
  { book: 'psalms', chapter: 138, verse: 23, end: 24 },
  { book: 'psalms', chapter: 145, verse: 18 },
  { book: 'proverbs', chapter: 3, verse: 5, end: 6 },
  { book: 'proverbs', chapter: 16, verse: 3 },
  { book: 'proverbs', chapter: 18, verse: 10 },
  { book: 'proverbs', chapter: 22, verse: 6 },
  { book: 'ecclesiastes', chapter: 3, verse: 1 },
  { book: 'isaiah', chapter: 40, verse: 31 },
  { book: 'isaiah', chapter: 41, verse: 10 },
  { book: 'isaiah', chapter: 53, verse: 5 },
  { book: 'jeremiah', chapter: 29, verse: 11 },
  { book: 'jeremiah', chapter: 33, verse: 3 },
  { book: 'lamentations', chapter: 3, verse: 22, end: 23 },
  { book: 'daniel', chapter: 12, verse: 3 },
  { book: 'matthew', chapter: 5, verse: 3 },
  { book: 'matthew', chapter: 6, verse: 33 },
  { book: 'matthew', chapter: 11, verse: 28 },
  { book: 'matthew', chapter: 22, verse: 37, end: 38 },
  { book: 'matthew', chapter: 28, verse: 19, end: 20 },
  { book: 'mark', chapter: 12, verse: 30 },
  { book: 'luke', chapter: 6, verse: 31 },
  { book: 'john', chapter: 1, verse: 1 },
  { book: 'john', chapter: 3, verse: 16 },
  { book: 'john', chapter: 8, verse: 32 },
  { book: 'john', chapter: 13, verse: 34 },
  { book: 'john', chapter: 14, verse: 1 },
  { book: 'john', chapter: 14, verse: 6 },
  { book: 'john', chapter: 14, verse: 27 },
  { book: 'john', chapter: 15, verse: 12 },
  { book: 'acts', chapter: 1, verse: 8 },
  { book: 'romans', chapter: 5, verse: 8 },
  { book: 'romans', chapter: 8, verse: 28 },
  { book: 'romans', chapter: 8, verse: 31 },
  { book: 'romans', chapter: 10, verse: 9 },
  { book: 'romans', chapter: 12, verse: 2 },
  { book: '1-corinthians', chapter: 13, verse: 4 },
  { book: '1-corinthians', chapter: 13, verse: 13 },
  { book: '2-corinthians', chapter: 5, verse: 17 },
  { book: 'galatians', chapter: 5, verse: 22, end: 23 },
  { book: 'ephesians', chapter: 2, verse: 8 },
  { book: 'ephesians', chapter: 6, verse: 11 },
  { book: 'philippians', chapter: 4, verse: 6, end: 7 },
  { book: 'philippians', chapter: 4, verse: 13 },
  { book: 'colossians', chapter: 3, verse: 23 },
  { book: '1-thessalonians', chapter: 5, verse: 16, end: 18 },
  { book: '2-timothy', chapter: 1, verse: 7 },
  { book: 'hebrews', chapter: 11, verse: 1 },
  { book: 'hebrews', chapter: 13, verse: 5 },
  { book: 'james', chapter: 1, verse: 5 },
  { book: '1-peter', chapter: 5, verse: 7 },
  { book: '1-john', chapter: 1, verse: 9 },
  { book: 'revelation', chapter: 3, verse: 20 },
];

/** Детерминированный выбор стиха дня по локальной дате (одинаковый у всех в один день). */
export function pickVerseOfDay(date = new Date()): VerseOfDayRef {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return VERSE_OF_DAY_LIST[(dayOfYear + date.getFullYear()) % VERSE_OF_DAY_LIST.length]!;
}
