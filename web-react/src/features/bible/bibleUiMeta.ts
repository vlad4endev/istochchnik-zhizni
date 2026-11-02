import type { BibleTranslation } from './api';

export type BibleRecentItem = {
  translation: string;
  translation_title: string;
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  at: number;
};

const RECENT_KEY = 'bible.recent';
const TRANSLATION_KEY = 'bible.translation';
const READER_SETTINGS_KEY = 'bible.readerSettings';

export type BibleReaderFont = 'serif' | 'sans';
export type BibleReaderSpacing = 'compact' | 'normal' | 'relaxed';

export type BibleReaderSettings = {
  /** Доп. масштаб текста ридера сверх общего --a11y-font-scale приложения. */
  fontScale: number;
  font: BibleReaderFont;
  spacing: BibleReaderSpacing;
};

export const BIBLE_READER_FONT_SCALES = [0.875, 1, 1.125, 1.25, 1.375] as const;

const DEFAULT_READER_SETTINGS: BibleReaderSettings = {
  fontScale: 1,
  font: 'serif',
  spacing: 'normal',
};

export const BIBLE_READER_SPACING_LINE_HEIGHT: Record<BibleReaderSpacing, number> = {
  compact: 1.35,
  normal: 1.7,
  relaxed: 2,
};

export function readReaderSettings(): BibleReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BibleReaderSettings>;
    return {
      fontScale: BIBLE_READER_FONT_SCALES.includes(parsed.fontScale as never)
        ? (parsed.fontScale as number)
        : DEFAULT_READER_SETTINGS.fontScale,
      font: parsed.font === 'sans' ? 'sans' : 'serif',
      spacing:
        parsed.spacing === 'compact' || parsed.spacing === 'relaxed'
          ? parsed.spacing
          : 'normal',
    };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function writeReaderSettings(next: BibleReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const PUBLISHER_BY_CODE: Record<string, string> = {
  synodal: 'Public domain',
  rbo: 'Российское Библейское общество',
  'joyous-news': 'РБО · В. Н. Кузнецова',
  cassian: 'еп. Кассиан (Безобразов)',
  desnitsky: 'А. С. Десницкий',
};

const BADGE_BY_CODE: Record<string, string> = {
  synodal: 'SYNO',
  rbo: 'СРП',
  'joyous-news': 'РВ',
  cassian: 'КАС',
  desnitsky: 'ДЕС',
};

export function translationBadge(t: Pick<BibleTranslation, 'code' | 'short_title'>): string {
  return BADGE_BY_CODE[t.code] || (t.short_title || t.code).slice(0, 6).toUpperCase();
}

export function translationPublisher(t: Pick<BibleTranslation, 'code' | 'license_note'>): string {
  return PUBLISHER_BY_CODE[t.code] || t.license_note || 'Русский перевод';
}

export function readStoredTranslation(fallback = 'synodal'): string {
  try {
    return localStorage.getItem(TRANSLATION_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredTranslation(code: string): void {
  try {
    localStorage.setItem(TRANSLATION_KEY, code);
  } catch {
    /* ignore */
  }
}

export function readRecentBible(limit = 8): BibleRecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BibleRecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x) =>
          x &&
          typeof x.translation === 'string' &&
          typeof x.book_slug === 'string' &&
          typeof x.chapter === 'number',
      )
      .slice(0, limit);
  } catch {
    return [];
  }
}

export function pushRecentBible(item: Omit<BibleRecentItem, 'at'>): BibleRecentItem[] {
  const next: BibleRecentItem = { ...item, at: Date.now() };
  const prev = readRecentBible(20).filter(
    (x) =>
      !(
        x.translation === next.translation &&
        x.book_slug === next.book_slug &&
        x.chapter === next.chapter
      ),
  );
  const list = [next, ...prev].slice(0, 12);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}
