/**
 * Каталог переводов Библии для раздела /bible.
 * Текст стихов: только у переводов с availability=available и залитым seed.
 * Остальные — метаданные + ожидание лицензии правообладателя (РБО и др.).
 */

export type BibleTranslationScope = 'full' | 'nt' | 'partial';
export type BibleTranslationAvailability = 'available' | 'license_required';

export interface BibleTranslationDef {
  code: string;
  title: string;
  shortTitle: string;
  year: string | null;
  language: string;
  scope: BibleTranslationScope;
  availability: BibleTranslationAvailability;
  description: string;
  licenseNote: string;
  sortOrder: number;
}

export const BIBLE_TRANSLATION_DEFS: readonly BibleTranslationDef[] = [
  {
    code: 'synodal',
    title: 'Синодальный перевод',
    shortTitle: 'Синод.',
    year: '1876',
    language: 'ru',
    scope: 'full',
    availability: 'available',
    description: 'Классический, традиционный, но с архаизмами.',
    licenseNote: 'Public domain (1876). Источник seed: Free.Bible / eBible.',
    sortOrder: 10,
  },
  {
    code: 'rbo',
    title: 'Современный русский перевод (РБО)',
    shortTitle: 'РБО',
    year: '2011+',
    language: 'ru',
    scope: 'full',
    availability: 'license_required',
    description: 'Понятный язык, учтена современная текстология.',
    licenseNote:
      '© Российское Библейское общество. Текст появится после лицензионного соглашения с РБО.',
    sortOrder: 20,
  },
  {
    code: 'joyous-news',
    title: 'Радостная весть',
    shortTitle: 'РВ',
    year: '2001',
    language: 'ru',
    scope: 'nt',
    availability: 'license_required',
    description: 'Живой, современный стиль (Новый Завет, В. Н. Кузнецова). Только Новый Завет.',
    licenseNote:
      '© Российское Библейское общество / перевод В. Н. Кузнецовой. Нужна лицензия на публикацию.',
    sortOrder: 30,
  },
  {
    code: 'cassian',
    title: 'Перевод под ред. еп. Кассиана (Безобразова)',
    shortTitle: 'Кассиан',
    year: '1970',
    language: 'ru',
    scope: 'nt',
    availability: 'license_required',
    description: 'Академичный, с учётом текстологических данных. Новый Завет.',
    licenseNote:
      '© Правообладатель / РБО. Авторские права действуют (ориентир до ~2035). Нужна лицензия.',
    sortOrder: 40,
  },
  {
    code: 'desnitsky',
    title: 'Перевод Андрея Десницкого',
    shortTitle: 'Десницкий',
    year: null,
    language: 'ru',
    scope: 'nt',
    availability: 'license_required',
    description: 'Ясный современный язык; Новый Завет готов, Ветхий — в работе.',
    licenseNote: '© Андрей Десницкий / издатель. Текст появится после разрешения правообладателя.',
    sortOrder: 50,
  },
] as const;

export function findTranslationDef(code: string): BibleTranslationDef | null {
  return BIBLE_TRANSLATION_DEFS.find((t) => t.code === code) ?? null;
}
