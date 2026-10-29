/**
 * Каталог переводов Библии для раздела /bible.
 * Текст стихов заливается CLI seed (`npm run bible:seed`).
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
    licenseNote: 'Источник seed: justbible.ru (translation=rst), fallback Free.Bible.',
    sortOrder: 10,
  },
  {
    code: 'rbo',
    title: 'Современный русский перевод (РБО)',
    shortTitle: 'РБО',
    year: '2011+',
    language: 'ru',
    scope: 'full',
    availability: 'available',
    description: 'Понятный язык, учтена современная текстология.',
    licenseNote: 'Источник seed: justbible.ru (translation=rbo).',
    sortOrder: 20,
  },
  {
    code: 'joyous-news',
    title: 'Радостная весть',
    shortTitle: 'РВ',
    year: '2001',
    language: 'ru',
    scope: 'nt',
    availability: 'available',
    description: 'Живой, современный стиль (Новый Завет, В. Н. Кузнецова). Только Новый Завет.',
    licenseNote: 'Текст появится после seed (источник пока не подключён).',
    sortOrder: 30,
  },
  {
    code: 'cassian',
    title: 'Перевод под ред. еп. Кассиана (Безобразова)',
    shortTitle: 'Кассиан',
    year: '1970',
    language: 'ru',
    scope: 'nt',
    availability: 'available',
    description: 'Академичный, с учётом текстологических данных. Новый Завет.',
    licenseNote: 'Источник seed: azbyka.ru (lang=b).',
    sortOrder: 40,
  },
  {
    code: 'desnitsky',
    title: 'Перевод Андрея Десницкого',
    shortTitle: 'Десницкий',
    year: null,
    language: 'ru',
    scope: 'partial',
    availability: 'available',
    description: 'Ясный современный язык; Новый Завет готов, Ветхий — в работе.',
    licenseNote: 'Источник seed: bolls.life (DESN).',
    sortOrder: 50,
  },
] as const;

export function findTranslationDef(code: string): BibleTranslationDef | null {
  return BIBLE_TRANSLATION_DEFS.find((t) => t.code === code) ?? null;
}
