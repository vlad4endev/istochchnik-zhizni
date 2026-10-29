/** Canonical Protestant 66-book order with Free.Bible / OSIS-style slugs. */

export type BibleTestament = 'ot' | 'nt';

export interface BibleBookDef {
  slug: string;
  ord: number;
  testament: BibleTestament;
  nameRu: string;
  shortNameRu: string;
  chapters: number;
  /** Lowercase aliases for scripture ref parsing (RU + common EN). */
  aliases: string[];
}

export const BIBLE_BOOK_DEFS: readonly BibleBookDef[] = [
  { slug: 'genesis', ord: 1, testament: 'ot', nameRu: 'Бытие', shortNameRu: 'Быт', chapters: 50, aliases: ['бытие', 'быт', 'бт', 'gen', 'genesis', 'ge', 'gn'] },
  { slug: 'exodus', ord: 2, testament: 'ot', nameRu: 'Исход', shortNameRu: 'Исх', chapters: 40, aliases: ['исход', 'исх', 'ex', 'exodus', 'exo'] },
  { slug: 'leviticus', ord: 3, testament: 'ot', nameRu: 'Левит', shortNameRu: 'Лев', chapters: 27, aliases: ['левит', 'лев', 'lev', 'leviticus', 'le'] },
  { slug: 'numbers', ord: 4, testament: 'ot', nameRu: 'Числа', shortNameRu: 'Чис', chapters: 36, aliases: ['числа', 'чис', 'num', 'numbers', 'nu', 'nm'] },
  { slug: 'deuteronomy', ord: 5, testament: 'ot', nameRu: 'Второзаконие', shortNameRu: 'Втор', chapters: 34, aliases: ['второзаконие', 'втор', 'deut', 'deuteronomy', 'dt', 'de'] },
  { slug: 'joshua', ord: 6, testament: 'ot', nameRu: 'Иисус Навин', shortNameRu: 'Нав', chapters: 24, aliases: ['навин', 'нав', 'иснав', 'ииснав', 'joshua', 'josh', 'jos'] },
  { slug: 'judges', ord: 7, testament: 'ot', nameRu: 'Судьи', shortNameRu: 'Суд', chapters: 21, aliases: ['судьи', 'суд', 'judges', 'judg', 'jdg'] },
  { slug: 'ruth', ord: 8, testament: 'ot', nameRu: 'Руфь', shortNameRu: 'Руф', chapters: 4, aliases: ['руфь', 'руф', 'ruth', 'ru'] },
  { slug: '1-samuel', ord: 9, testament: 'ot', nameRu: '1 Царств', shortNameRu: '1Цар', chapters: 31, aliases: ['1царств', '1цар', '1ц', '1samuel', '1sam', '1sa', '1 царств', '1 цар'] },
  { slug: '2-samuel', ord: 10, testament: 'ot', nameRu: '2 Царств', shortNameRu: '2Цар', chapters: 24, aliases: ['2царств', '2цар', '2ц', '2samuel', '2sam', '2sa', '2 царств', '2 цар'] },
  { slug: '1-kings', ord: 11, testament: 'ot', nameRu: '3 Царств', shortNameRu: '3Цар', chapters: 22, aliases: ['3царств', '3цар', '3ц', '1kings', '1kgs', '1ki', '3 царств', '3 цар'] },
  { slug: '2-kings', ord: 12, testament: 'ot', nameRu: '4 Царств', shortNameRu: '4Цар', chapters: 25, aliases: ['4царств', '4цар', '4ц', '2kings', '2kgs', '2ki', '4 царств', '4 цар'] },
  { slug: '1-chronicles', ord: 13, testament: 'ot', nameRu: '1 Паралипоменон', shortNameRu: '1Пар', chapters: 29, aliases: ['1пар', '1паралипоменон', '1chr', '1chronicles', '1ch', '1 пар'] },
  { slug: '2-chronicles', ord: 14, testament: 'ot', nameRu: '2 Паралипоменон', shortNameRu: '2Пар', chapters: 36, aliases: ['2пар', '2паралипоменон', '2chr', '2chronicles', '2ch', '2 пар'] },
  { slug: 'ezra', ord: 15, testament: 'ot', nameRu: 'Ездра', shortNameRu: 'Езд', chapters: 10, aliases: ['ездра', 'езд', 'ezra', 'ezr'] },
  { slug: 'nehemiah', ord: 16, testament: 'ot', nameRu: 'Неемия', shortNameRu: 'Неем', chapters: 13, aliases: ['неемия', 'неем', 'neh', 'nehemiah'] },
  { slug: 'esther', ord: 17, testament: 'ot', nameRu: 'Есфирь', shortNameRu: 'Есф', chapters: 10, aliases: ['есфирь', 'есф', 'est', 'esther'] },
  { slug: 'job', ord: 18, testament: 'ot', nameRu: 'Иов', shortNameRu: 'Иов', chapters: 42, aliases: ['иов', 'job'] },
  { slug: 'psalms', ord: 19, testament: 'ot', nameRu: 'Псалтирь', shortNameRu: 'Пс', chapters: 150, aliases: ['псалтирь', 'псалтырь', 'псалом', 'пс', 'ps', 'psalm', 'psalms', 'psa'] },
  { slug: 'proverbs', ord: 20, testament: 'ot', nameRu: 'Притчи', shortNameRu: 'Прит', chapters: 31, aliases: ['притчи', 'прит', 'prov', 'proverbs', 'pr'] },
  { slug: 'ecclesiastes', ord: 21, testament: 'ot', nameRu: 'Екклесиаст', shortNameRu: 'Еккл', chapters: 12, aliases: ['екклесиаст', 'еккл', 'ecc', 'ecclesiastes', 'eccl'] },
  { slug: 'song-of-solomon', ord: 22, testament: 'ot', nameRu: 'Песнь Песней', shortNameRu: 'Песн', chapters: 8, aliases: ['песнь', 'песн', 'пп', 'song', 'sos', 'cant'] },
  { slug: 'isaiah', ord: 23, testament: 'ot', nameRu: 'Исаия', shortNameRu: 'Ис', chapters: 66, aliases: ['исаия', 'ис', 'isa', 'isaiah'] },
  { slug: 'jeremiah', ord: 24, testament: 'ot', nameRu: 'Иеремия', shortNameRu: 'Иер', chapters: 52, aliases: ['иеремия', 'иер', 'jer', 'jeremiah'] },
  { slug: 'lamentations', ord: 25, testament: 'ot', nameRu: 'Плач Иеремии', shortNameRu: 'Плач', chapters: 5, aliases: ['плач', 'lam', 'lamentations'] },
  { slug: 'ezekiel', ord: 26, testament: 'ot', nameRu: 'Иезекииль', shortNameRu: 'Иез', chapters: 48, aliases: ['иезекииль', 'иез', 'ezek', 'ezekiel', 'eze'] },
  { slug: 'daniel', ord: 27, testament: 'ot', nameRu: 'Даниил', shortNameRu: 'Дан', chapters: 12, aliases: ['даниил', 'дан', 'dan', 'daniel'] },
  { slug: 'hosea', ord: 28, testament: 'ot', nameRu: 'Осия', shortNameRu: 'Ос', chapters: 14, aliases: ['осия', 'ос', 'hos', 'hosea'] },
  { slug: 'joel', ord: 29, testament: 'ot', nameRu: 'Иоиль', shortNameRu: 'Иоил', chapters: 3, aliases: ['иоиль', 'иоил', 'joel', 'jol'] },
  { slug: 'amos', ord: 30, testament: 'ot', nameRu: 'Амос', shortNameRu: 'Ам', chapters: 9, aliases: ['амос', 'ам', 'amos', 'amo'] },
  { slug: 'obadiah', ord: 31, testament: 'ot', nameRu: 'Авдий', shortNameRu: 'Авд', chapters: 1, aliases: ['авдий', 'авд', 'obad', 'obadiah', 'oba'] },
  { slug: 'jonah', ord: 32, testament: 'ot', nameRu: 'Иона', shortNameRu: 'Ион', chapters: 4, aliases: ['иона', 'ион', 'jonah', 'jon'] },
  { slug: 'micah', ord: 33, testament: 'ot', nameRu: 'Михей', shortNameRu: 'Мих', chapters: 7, aliases: ['михей', 'мих', 'mic', 'micah'] },
  { slug: 'nahum', ord: 34, testament: 'ot', nameRu: 'Наум', shortNameRu: 'Наум', chapters: 3, aliases: ['наум', 'nah', 'nahum'] },
  { slug: 'habakkuk', ord: 35, testament: 'ot', nameRu: 'Аввакум', shortNameRu: 'Авв', chapters: 3, aliases: ['аввакум', 'авв', 'hab', 'habakkuk'] },
  { slug: 'zephaniah', ord: 36, testament: 'ot', nameRu: 'Софония', shortNameRu: 'Соф', chapters: 3, aliases: ['софония', 'соф', 'zeph', 'zephaniah', 'zep'] },
  { slug: 'haggai', ord: 37, testament: 'ot', nameRu: 'Аггей', shortNameRu: 'Агг', chapters: 2, aliases: ['аггей', 'агг', 'hag', 'haggai'] },
  { slug: 'zechariah', ord: 38, testament: 'ot', nameRu: 'Захария', shortNameRu: 'Зах', chapters: 14, aliases: ['захария', 'зах', 'zech', 'zechariah', 'zec'] },
  { slug: 'malachi', ord: 39, testament: 'ot', nameRu: 'Малахия', shortNameRu: 'Мал', chapters: 4, aliases: ['малахия', 'мал', 'mal', 'malachi'] },
  { slug: 'matthew', ord: 40, testament: 'nt', nameRu: 'От Матфея', shortNameRu: 'Мф', chapters: 28, aliases: ['матфея', 'матфей', 'мф', 'мт', 'matt', 'matthew', 'mt', 'мат'] },
  { slug: 'mark', ord: 41, testament: 'nt', nameRu: 'От Марка', shortNameRu: 'Мк', chapters: 16, aliases: ['марка', 'марк', 'мк', 'мр', 'mark', 'mk', 'mr'] },
  { slug: 'luke', ord: 42, testament: 'nt', nameRu: 'От Луки', shortNameRu: 'Лк', chapters: 24, aliases: ['луки', 'лука', 'лк', 'luke', 'lk', 'lu'] },
  { slug: 'john', ord: 43, testament: 'nt', nameRu: 'От Иоанна', shortNameRu: 'Ин', chapters: 21, aliases: ['иоанна', 'иоанн', 'ин', 'john', 'jn', 'joh'] },
  { slug: 'acts', ord: 44, testament: 'nt', nameRu: 'Деяния', shortNameRu: 'Деян', chapters: 28, aliases: ['деяния', 'деян', 'acts', 'act', 'ac'] },
  { slug: 'romans', ord: 45, testament: 'nt', nameRu: 'К Римлянам', shortNameRu: 'Рим', chapters: 16, aliases: ['римлянам', 'рим', 'rom', 'romans', 'ro'] },
  { slug: '1-corinthians', ord: 46, testament: 'nt', nameRu: '1 Коринфянам', shortNameRu: '1Кор', chapters: 16, aliases: ['1коринфянам', '1кор', '1cor', '1corinthians', '1co', '1 кор'] },
  { slug: '2-corinthians', ord: 47, testament: 'nt', nameRu: '2 Коринфянам', shortNameRu: '2Кор', chapters: 13, aliases: ['2коринфянам', '2кор', '2cor', '2corinthians', '2co', '2 кор'] },
  { slug: 'galatians', ord: 48, testament: 'nt', nameRu: 'К Галатам', shortNameRu: 'Гал', chapters: 6, aliases: ['галатам', 'гал', 'gal', 'galatians'] },
  { slug: 'ephesians', ord: 49, testament: 'nt', nameRu: 'К Ефесянам', shortNameRu: 'Еф', chapters: 6, aliases: ['ефесянам', 'еф', 'eph', 'ephesians'] },
  { slug: 'philippians', ord: 50, testament: 'nt', nameRu: 'К Филиппийцам', shortNameRu: 'Флп', chapters: 4, aliases: ['филиппийцам', 'флп', 'phil', 'philippians', 'php'] },
  { slug: 'colossians', ord: 51, testament: 'nt', nameRu: 'К Колоссянам', shortNameRu: 'Кол', chapters: 4, aliases: ['колоссянам', 'кол', 'col', 'colossians'] },
  { slug: '1-thessalonians', ord: 52, testament: 'nt', nameRu: '1 Фессалоникийцам', shortNameRu: '1Фес', chapters: 5, aliases: ['1фессалоникийцам', '1фес', '1thess', '1th', '1 фес'] },
  { slug: '2-thessalonians', ord: 53, testament: 'nt', nameRu: '2 Фессалоникийцам', shortNameRu: '2Фес', chapters: 3, aliases: ['2фессалоникийцам', '2фес', '2thess', '2th', '2 фес'] },
  { slug: '1-timothy', ord: 54, testament: 'nt', nameRu: '1 Тимофею', shortNameRu: '1Тим', chapters: 6, aliases: ['1тимофею', '1тим', '1tim', '1ti', '1 тим'] },
  { slug: '2-timothy', ord: 55, testament: 'nt', nameRu: '2 Тимофею', shortNameRu: '2Тим', chapters: 4, aliases: ['2тимофею', '2тим', '2tim', '2ti', '2 тим'] },
  { slug: 'titus', ord: 56, testament: 'nt', nameRu: 'К Титу', shortNameRu: 'Тит', chapters: 3, aliases: ['титу', 'тит', 'tit', 'titus'] },
  { slug: 'philemon', ord: 57, testament: 'nt', nameRu: 'К Филимону', shortNameRu: 'Флм', chapters: 1, aliases: ['филимону', 'флм', 'phlm', 'philemon', 'phm'] },
  { slug: 'hebrews', ord: 58, testament: 'nt', nameRu: 'К Евреям', shortNameRu: 'Евр', chapters: 13, aliases: ['евреям', 'евр', 'heb', 'hebrews'] },
  { slug: 'james', ord: 59, testament: 'nt', nameRu: 'Иакова', shortNameRu: 'Иак', chapters: 5, aliases: ['иакова', 'иак', 'jas', 'james', 'jam'] },
  { slug: '1-peter', ord: 60, testament: 'nt', nameRu: '1 Петра', shortNameRu: '1Пет', chapters: 5, aliases: ['1петра', '1пет', '1pet', '1pe', '1 пет'] },
  { slug: '2-peter', ord: 61, testament: 'nt', nameRu: '2 Петра', shortNameRu: '2Пет', chapters: 3, aliases: ['2петра', '2пет', '2pet', '2pe', '2 пет'] },
  { slug: '1-john', ord: 62, testament: 'nt', nameRu: '1 Иоанна', shortNameRu: '1Ин', chapters: 5, aliases: ['1иоанна', '1ин', '1john', '1jn', '1 ин', '1иоан'] },
  { slug: '2-john', ord: 63, testament: 'nt', nameRu: '2 Иоанна', shortNameRu: '2Ин', chapters: 1, aliases: ['2иоанна', '2ин', '2john', '2jn', '2 ин'] },
  { slug: '3-john', ord: 64, testament: 'nt', nameRu: '3 Иоанна', shortNameRu: '3Ин', chapters: 1, aliases: ['3иоанна', '3ин', '3john', '3jn', '3 ин'] },
  { slug: 'jude', ord: 65, testament: 'nt', nameRu: 'Иуды', shortNameRu: 'Иуд', chapters: 1, aliases: ['иуды', 'иуд', 'jude', 'jud'] },
  { slug: 'revelation', ord: 66, testament: 'nt', nameRu: 'Откровение', shortNameRu: 'Откр', chapters: 22, aliases: ['откровение', 'откр', 'rev', 'revelation', 're'] },
] as const;

const ALIAS_TO_SLUG = (() => {
  const map = new Map<string, string>();
  for (const book of BIBLE_BOOK_DEFS) {
    map.set(normalizeAlias(book.slug), book.slug);
    map.set(normalizeAlias(book.shortNameRu), book.slug);
    map.set(normalizeAlias(book.nameRu), book.slug);
    for (const a of book.aliases) {
      map.set(normalizeAlias(a), book.slug);
    }
  }
  return map;
})();

export function normalizeAlias(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\u00a0]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

export function findBookDefByAlias(raw: string): BibleBookDef | null {
  const slug = ALIAS_TO_SLUG.get(normalizeAlias(raw));
  if (!slug) return null;
  return BIBLE_BOOK_DEFS.find((b) => b.slug === slug) ?? null;
}

export function findBookDefBySlug(slug: string): BibleBookDef | null {
  return BIBLE_BOOK_DEFS.find((b) => b.slug === slug) ?? null;
}
