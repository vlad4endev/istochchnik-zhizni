/** Client-side scripture ref helpers (mirrors src/bible/bibleRefParser). */

const BOOK_ALIASES: Array<{ slug: string; aliases: string[] }> = [
  { slug: 'genesis', aliases: ['бытие', 'быт', 'бт', 'gen', 'genesis'] },
  { slug: 'exodus', aliases: ['исход', 'исх', 'exodus', 'ex'] },
  { slug: 'leviticus', aliases: ['левит', 'лев', 'lev'] },
  { slug: 'numbers', aliases: ['числа', 'чис', 'num'] },
  { slug: 'deuteronomy', aliases: ['второзаконие', 'втор', 'deut'] },
  { slug: 'joshua', aliases: ['навин', 'нав', 'joshua'] },
  { slug: 'judges', aliases: ['судьи', 'суд', 'judges'] },
  { slug: 'ruth', aliases: ['руфь', 'руф', 'ruth'] },
  { slug: '1-samuel', aliases: ['1царств', '1цар', '1sam', '1 царств', '1 цар'] },
  { slug: '2-samuel', aliases: ['2царств', '2цар', '2sam', '2 царств', '2 цар'] },
  { slug: '1-kings', aliases: ['3царств', '3цар', '1kings', '3 царств', '3 цар'] },
  { slug: '2-kings', aliases: ['4царств', '4цар', '2kings', '4 царств', '4 цар'] },
  { slug: '1-chronicles', aliases: ['1пар', '1chr', '1 пар'] },
  { slug: '2-chronicles', aliases: ['2пар', '2chr', '2 пар'] },
  { slug: 'ezra', aliases: ['ездра', 'езд', 'ezra'] },
  { slug: 'nehemiah', aliases: ['неемия', 'неем', 'neh'] },
  { slug: 'esther', aliases: ['есфирь', 'есф', 'est'] },
  { slug: 'job', aliases: ['иов', 'job'] },
  { slug: 'psalms', aliases: ['псалтирь', 'псалтырь', 'пс', 'ps', 'psalm', 'psalms'] },
  { slug: 'proverbs', aliases: ['притчи', 'прит', 'prov'] },
  { slug: 'ecclesiastes', aliases: ['екклесиаст', 'еккл', 'ecc'] },
  { slug: 'song-of-solomon', aliases: ['песнь', 'песн', 'song'] },
  { slug: 'isaiah', aliases: ['исаия', 'ис', 'isa'] },
  { slug: 'jeremiah', aliases: ['иеремия', 'иер', 'jer'] },
  { slug: 'lamentations', aliases: ['плач', 'lam'] },
  { slug: 'ezekiel', aliases: ['иезекииль', 'иез', 'ezek'] },
  { slug: 'daniel', aliases: ['даниил', 'дан', 'dan'] },
  { slug: 'hosea', aliases: ['осия', 'ос', 'hos'] },
  { slug: 'joel', aliases: ['иоиль', 'иоил', 'joel'] },
  { slug: 'amos', aliases: ['амос', 'ам', 'amos'] },
  { slug: 'obadiah', aliases: ['авдий', 'авд', 'obad'] },
  { slug: 'jonah', aliases: ['иона', 'ион', 'jonah'] },
  { slug: 'micah', aliases: ['михей', 'мих', 'mic'] },
  { slug: 'nahum', aliases: ['наум', 'nah'] },
  { slug: 'habakkuk', aliases: ['аввакум', 'авв', 'hab'] },
  { slug: 'zephaniah', aliases: ['софония', 'соф', 'zeph'] },
  { slug: 'haggai', aliases: ['аггей', 'агг', 'hag'] },
  { slug: 'zechariah', aliases: ['захария', 'зах', 'zech'] },
  { slug: 'malachi', aliases: ['малахия', 'мал', 'mal'] },
  { slug: 'matthew', aliases: ['матфея', 'матфей', 'мф', 'мт', 'matt', 'matthew', 'мат'] },
  { slug: 'mark', aliases: ['марка', 'марк', 'мк', 'mark'] },
  { slug: 'luke', aliases: ['луки', 'лука', 'лк', 'luke'] },
  { slug: 'john', aliases: ['иоанна', 'иоанн', 'ин', 'john', 'jn'] },
  { slug: 'acts', aliases: ['деяния', 'деян', 'acts'] },
  { slug: 'romans', aliases: ['римлянам', 'рим', 'rom'] },
  { slug: '1-corinthians', aliases: ['1коринфянам', '1кор', '1cor', '1 кор'] },
  { slug: '2-corinthians', aliases: ['2коринфянам', '2кор', '2cor', '2 кор'] },
  { slug: 'galatians', aliases: ['галатам', 'гал', 'gal'] },
  { slug: 'ephesians', aliases: ['ефесянам', 'еф', 'eph'] },
  { slug: 'philippians', aliases: ['филиппийцам', 'флп', 'phil'] },
  { slug: 'colossians', aliases: ['колоссянам', 'кол', 'col'] },
  { slug: '1-thessalonians', aliases: ['1фес', '1thess', '1 фес'] },
  { slug: '2-thessalonians', aliases: ['2фес', '2thess', '2 фес'] },
  { slug: '1-timothy', aliases: ['1тим', '1tim', '1 тим'] },
  { slug: '2-timothy', aliases: ['2тим', '2tim', '2 тим'] },
  { slug: 'titus', aliases: ['титу', 'тит', 'tit'] },
  { slug: 'philemon', aliases: ['филимону', 'флм', 'phlm'] },
  { slug: 'hebrews', aliases: ['евреям', 'евр', 'heb'] },
  { slug: 'james', aliases: ['иакова', 'иак', 'james'] },
  { slug: '1-peter', aliases: ['1петра', '1пет', '1pet', '1 пет'] },
  { slug: '2-peter', aliases: ['2петра', '2пет', '2pet', '2 пет'] },
  { slug: '1-john', aliases: ['1иоанна', '1ин', '1john', '1 ин'] },
  { slug: '2-john', aliases: ['2иоанна', '2ин', '2john', '2 ин'] },
  { slug: '3-john', aliases: ['3иоанна', '3ин', '3john', '3 ин'] },
  { slug: 'jude', aliases: ['иуды', 'иуд', 'jude'] },
  { slug: 'revelation', aliases: ['откровение', 'откр', 'rev'] },
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.\u00a0]/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

const ALIAS_MAP = (() => {
  const m = new Map<string, string>();
  for (const b of BOOK_ALIASES) {
    m.set(norm(b.slug), b.slug);
    for (const a of b.aliases) m.set(norm(a), b.slug);
  }
  return m;
})();

export interface ParsedBibleRef {
  bookSlug: string;
  chapter: number;
  verseStart: number | null;
  verseEnd: number | null;
}

export function parseBibleRef(raw: string): ParsedBibleRef | null {
  const cleaned = String(raw ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const match = cleaned.match(
    /^((?:\d\s*)?[A-Za-zА-Яа-яЁё.]+(?:\s+[A-Za-zА-Яа-яЁё.]+)?)\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?\s*$/u,
  );
  if (!match) return null;
  const bookSlug = ALIAS_MAP.get(norm(match[1].replace(/\./g, '')));
  if (!bookSlug) return null;
  const chapter = Number(match[2]);
  if (!Number.isInteger(chapter) || chapter < 1) return null;
  return {
    bookSlug,
    chapter,
    verseStart: match[3] != null ? Number(match[3]) : null,
    verseEnd: match[4] != null ? Number(match[4]) : null,
  };
}

export function buildInternalBibleUrl(scripture: string, translation = 'synodal'): string {
  const parsed = parseBibleRef(scripture);
  if (!parsed) return `/bible?q=${encodeURIComponent(scripture.trim())}`;
  const base = `/bible/${translation}/${parsed.bookSlug}/${parsed.chapter}`;
  return parsed.verseStart != null ? `${base}?v=${parsed.verseStart}` : base;
}

/** Краткие русские имена для подписей в планах чтения. */
const SHORT_NAME_BY_SLUG: Record<string, string> = {
  genesis: 'Быт',
  exodus: 'Исх',
  leviticus: 'Лев',
  numbers: 'Чис',
  deuteronomy: 'Втор',
  joshua: 'Нав',
  judges: 'Суд',
  ruth: 'Руф',
  '1-samuel': '1Цар',
  '2-samuel': '2Цар',
  '1-kings': '3Цар',
  '2-kings': '4Цар',
  '1-chronicles': '1Пар',
  '2-chronicles': '2Пар',
  ezra: 'Езд',
  nehemiah: 'Неем',
  esther: 'Есф',
  job: 'Иов',
  psalms: 'Пс',
  proverbs: 'Прит',
  ecclesiastes: 'Еккл',
  'song-of-solomon': 'Песн',
  isaiah: 'Ис',
  jeremiah: 'Иер',
  lamentations: 'Плач',
  ezekiel: 'Иез',
  daniel: 'Дан',
  hosea: 'Ос',
  joel: 'Иоил',
  amos: 'Ам',
  obadiah: 'Авд',
  jonah: 'Ион',
  micah: 'Мих',
  nahum: 'Наум',
  habakkuk: 'Авв',
  zephaniah: 'Соф',
  haggai: 'Агг',
  zechariah: 'Зах',
  malachi: 'Мал',
  matthew: 'Мф',
  mark: 'Мк',
  luke: 'Лк',
  john: 'Ин',
  acts: 'Деян',
  romans: 'Рим',
  '1-corinthians': '1Кор',
  '2-corinthians': '2Кор',
  galatians: 'Гал',
  ephesians: 'Еф',
  philippians: 'Флп',
  colossians: 'Кол',
  '1-thessalonians': '1Фес',
  '2-thessalonians': '2Фес',
  '1-timothy': '1Тим',
  '2-timothy': '2Тим',
  titus: 'Тит',
  philemon: 'Флм',
  hebrews: 'Евр',
  james: 'Иак',
  '1-peter': '1Пет',
  '2-peter': '2Пет',
  '1-john': '1Ин',
  '2-john': '2Ин',
  '3-john': '3Ин',
  jude: 'Иуд',
  revelation: 'Откр',
};

export type BiblePlanRefLike = {
  book_slug: string;
  chapter: number;
  verse_start?: number;
  verse_end?: number;
};

export function formatBiblePlanRef(ref: BiblePlanRefLike): string {
  const short = SHORT_NAME_BY_SLUG[ref.book_slug] || ref.book_slug;
  let label = `${short}\u00a0${ref.chapter}`;
  if (ref.verse_start != null && ref.verse_start > 0) {
    label += `:${ref.verse_start}`;
    if (ref.verse_end != null && ref.verse_end > 0 && ref.verse_end !== ref.verse_start) {
      label += `–${ref.verse_end}`;
    }
  }
  return label;
}

export function biblePlanRefUrl(ref: BiblePlanRefLike, translation = 'synodal'): string {
  const base = `/bible/${translation}/${ref.book_slug}/${ref.chapter}`;
  return ref.verse_start != null && ref.verse_start > 0 ? `${base}?v=${ref.verse_start}` : base;
}

export function verseFromTimings(
  timings: Array<{ v: number; start: number; end?: number }>,
  currentTime: number,
): number | null {
  if (!timings.length) return null;
  const t = Number(currentTime);
  if (!Number.isFinite(t) || t < 0) return null;
  let current: number | null = null;
  for (const item of timings) {
    const start = Number(item.start);
    const end = item.end != null ? Number(item.end) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(start)) continue;
    if (t >= start && t < end) return item.v;
    if (t >= start) current = item.v;
  }
  return current;
}
