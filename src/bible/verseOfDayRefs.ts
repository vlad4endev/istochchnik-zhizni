/**
 * Курируемый список известных отрывков для виджета «Стих дня».
 * Ротация детерминирована по дню года (см. getVerseOfDay) — все пользователи
 * в один день видят один и тот же стих, без внешнего датасета или API.
 */
export interface VerseOfDayRef {
  bookSlug: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number;
}

export const VERSE_OF_DAY_REFS: VerseOfDayRef[] = [
  { bookSlug: 'john', chapter: 3, verseStart: 16 },
  { bookSlug: 'psalms', chapter: 23, verseStart: 1, verseEnd: 2 },
  { bookSlug: 'philippians', chapter: 4, verseStart: 13 },
  { bookSlug: 'proverbs', chapter: 3, verseStart: 5, verseEnd: 6 },
  { bookSlug: 'romans', chapter: 8, verseStart: 28 },
  { bookSlug: 'isaiah', chapter: 41, verseStart: 10 },
  { bookSlug: 'matthew', chapter: 11, verseStart: 28 },
  { bookSlug: 'jeremiah', chapter: 29, verseStart: 11 },
  { bookSlug: '1-corinthians', chapter: 13, verseStart: 4, verseEnd: 7 },
  { bookSlug: 'psalms', chapter: 46, verseStart: 1 },
  { bookSlug: 'joshua', chapter: 1, verseStart: 9 },
  { bookSlug: 'matthew', chapter: 6, verseStart: 33 },
  { bookSlug: 'romans', chapter: 12, verseStart: 2 },
  { bookSlug: '2-timothy', chapter: 1, verseStart: 7 },
  { bookSlug: 'psalms', chapter: 34, verseStart: 18 },
  { bookSlug: 'galatians', chapter: 5, verseStart: 22, verseEnd: 23 },
  { bookSlug: 'john', chapter: 14, verseStart: 27 },
  { bookSlug: 'hebrews', chapter: 11, verseStart: 1 },
  { bookSlug: 'psalms', chapter: 119, verseStart: 105 },
  { bookSlug: 'matthew', chapter: 28, verseStart: 19, verseEnd: 20 },
  { bookSlug: 'ephesians', chapter: 2, verseStart: 8, verseEnd: 9 },
  { bookSlug: 'james', chapter: 1, verseStart: 2, verseEnd: 3 },
  { bookSlug: 'psalms', chapter: 139, verseStart: 14 },
  { bookSlug: 'isaiah', chapter: 40, verseStart: 31 },
  { bookSlug: '1-peter', chapter: 5, verseStart: 7 },
  { bookSlug: 'luke', chapter: 1, verseStart: 37 },
  { bookSlug: 'colossians', chapter: 3, verseStart: 23 },
  { bookSlug: 'psalms', chapter: 27, verseStart: 1 },
  { bookSlug: 'matthew', chapter: 5, verseStart: 14 },
  { bookSlug: 'romans', chapter: 5, verseStart: 8 },
  { bookSlug: '1-john', chapter: 4, verseStart: 18 },
  { bookSlug: 'philippians', chapter: 4, verseStart: 6, verseEnd: 7 },
  { bookSlug: 'psalms', chapter: 121, verseStart: 1, verseEnd: 2 },
  { bookSlug: 'john', chapter: 1, verseStart: 1 },
  { bookSlug: 'matthew', chapter: 7, verseStart: 7 },
  { bookSlug: 'deuteronomy', chapter: 31, verseStart: 6 },
  { bookSlug: 'psalms', chapter: 103, verseStart: 2, verseEnd: 3 },
  { bookSlug: 'john', chapter: 15, verseStart: 13 },
  { bookSlug: 'ecclesiastes', chapter: 3, verseStart: 1 },
  { bookSlug: 'revelation', chapter: 21, verseStart: 4 },
  { bookSlug: 'galatians', chapter: 2, verseStart: 20 },
];
