/**
 * Seed Bible translations into Postgres.
 *
 * Sources:
 *   synodal     — justbible.ru (translation=rst), fallback Free.Bible
 *   rbo         — justbible.ru API
 *   desnitsky   — bolls.life DESN
 *   cassian     — azbyka.ru HTML (lang=b, NT)
 *   joyous-news — no public seed source yet (catalog only)
 *
 * Usage:
 *   npx ts-node --transpile-only src/cli/seedBibleSynodal.ts
 *   npx ts-node --transpile-only src/cli/seedBibleSynodal.ts --translation=rbo
 *   npx ts-node --transpile-only src/cli/seedBibleSynodal.ts --translation=all --books=john,matthew --max-chapters=3
 *   --force          перезалить главы, даже если стихи уже есть
 *   --delay-ms=200   пауза между главами (или BIBLE_SEED_DELAY_MS)
 * Повтор при ETIMEDOUT: BIBLE_SEED_FETCH_RETRIES=6, BIBLE_SEED_FETCH_TIMEOUT_MS=45000
 */
import { loadEnvFromDotenv } from './loadEnv';

loadEnvFromDotenv();

import { BIBLE_BOOK_DEFS, type BibleBookDef } from '../bible/bibleBookCatalog';
import {
  BIBLE_TRANSLATION_DEFS,
  findTranslationDef,
  type BibleTranslationDef,
} from '../bible/bibleTranslationCatalog';
import { pool, query } from '../config/db';
import {
  ensureCatalogTranslations,
  ensureTranslationBooks,
  upsertChapterVerses,
  countVerses,
  type BibleBookRow,
  type BibleTranslationRow,
} from '../services/bibleCatalogService';
import { ensureSampleLopukhinCommentary } from '../services/bibleCommentariesService';

type Verse = { v: number; t: string };

const AZBYKA_NT_CODES: Record<string, string> = {
  matthew: 'Mt',
  mark: 'Mk',
  luke: 'Lk',
  john: 'Jn',
  acts: 'Act',
  romans: 'Rom',
  '1-corinthians': '1Cor',
  '2-corinthians': '2Cor',
  galatians: 'Gal',
  ephesians: 'Eph',
  philippians: 'Phil',
  colossians: 'Col',
  '1-thessalonians': '1Thes',
  '2-thessalonians': '2Thes',
  '1-timothy': '1Tim',
  '2-timothy': '2Tim',
  titus: 'Tit',
  philemon: 'Phlm',
  hebrews: 'Hebr',
  james: 'Jac',
  '1-peter': '1Pet',
  '2-peter': '2Pet',
  '1-john': '1Jn',
  '2-john': '2Jn',
  '3-john': '3Jn',
  jude: 'Juda',
  revelation: 'Apok',
};

/**
 * justbible.ru: ВЗ 1–39 как у протестантов; НЗ — восточный порядок
 * (соборные послания до Павловых). Наш `book.ord` — протестантский.
 * Без этого маппинга Рим. уходит в Иакова и т.д.
 */
const JUSTBIBLE_BOOK_ID_BY_SLUG: Record<string, number> = {
  genesis: 1,
  exodus: 2,
  leviticus: 3,
  numbers: 4,
  deuteronomy: 5,
  joshua: 6,
  judges: 7,
  ruth: 8,
  '1-samuel': 9,
  '2-samuel': 10,
  '1-kings': 11,
  '2-kings': 12,
  '1-chronicles': 13,
  '2-chronicles': 14,
  ezra: 15,
  nehemiah: 16,
  esther: 17,
  job: 18,
  psalms: 19,
  proverbs: 20,
  ecclesiastes: 21,
  'song-of-solomon': 22,
  isaiah: 23,
  jeremiah: 24,
  lamentations: 25,
  ezekiel: 26,
  daniel: 27,
  hosea: 28,
  joel: 29,
  amos: 30,
  obadiah: 31,
  jonah: 32,
  micah: 33,
  nahum: 34,
  habakkuk: 35,
  zephaniah: 36,
  haggai: 37,
  zechariah: 38,
  malachi: 39,
  matthew: 40,
  mark: 41,
  luke: 42,
  john: 43,
  acts: 44,
  james: 45,
  '1-peter': 46,
  '2-peter': 47,
  '1-john': 48,
  '2-john': 49,
  '3-john': 50,
  jude: 51,
  romans: 52,
  '1-corinthians': 53,
  '2-corinthians': 54,
  galatians: 55,
  ephesians: 56,
  philippians: 57,
  colossians: 58,
  '1-thessalonians': 59,
  '2-thessalonians': 60,
  '1-timothy': 61,
  '2-timothy': 62,
  titus: 63,
  philemon: 64,
  hebrews: 65,
  revelation: 66,
};

function justbibleBookId(book: BibleBookDef): number {
  const id = JUSTBIBLE_BOOK_ID_BY_SLUG[book.slug];
  if (!id) throw new Error(`no justbible book id for ${book.slug}`);
  return id;
}

/** Книги, где justbible id ≠ protestant ord — при resume нельзя skip (могли залить чужой текст). */
function justbibleIdDiffersFromOrd(book: BibleBookDef): boolean {
  return JUSTBIBLE_BOOK_ID_BY_SLUG[book.slug] !== book.ord;
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ?? '';
  return (
    /etimedout|econnreset|econnrefused|enotfound|eai_again|socket|network|fetch failed|terminated|aborted|timeout/i.test(
      msg,
    ) ||
    /etimedout|econnreset|econnrefused|enotfound|eai_again|und_err|aborted/i.test(code) ||
    /etimedout|econnreset|fetch failed|terminated/i.test(String(cause?.message ?? ''))
  );
}

async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    (err as Error & { httpStatus?: number }).httpStatus = res.status;
    throw err;
  }
  return res;
}

/** Ретраи при ETIMEDOUT / обрывах TLS — типично для free.bible / azbyka с VPS. */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  as: 'json' | 'text',
): Promise<unknown> {
  const attempts = Math.max(1, Number(process.env.BIBLE_SEED_FETCH_RETRIES ?? 6));
  const timeoutMs = Math.max(5_000, Number(process.env.BIBLE_SEED_FETCH_TIMEOUT_MS ?? 45_000));
  let last: unknown;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetchOnce(url, headers, timeoutMs);
      return as === 'json' ? res.json() : res.text();
    } catch (e) {
      last = e;
      const httpStatus = (e as Error & { httpStatus?: number }).httpStatus;
      const retryable =
        isTransientFetchError(e) || httpStatus === 429 || httpStatus === 502 || httpStatus === 503;
      if (!retryable || i === attempts) break;
      const backoff = Math.min(30_000, 800 * 2 ** (i - 1) + Math.floor(Math.random() * 400));
      console.warn(
        `[bible-seed] retry ${i}/${attempts} after ${backoff}ms: ${url} (${e instanceof Error ? e.message : e})`,
      );
      await sleep(backoff);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function fetchJson(url: string): Promise<unknown> {
  return fetchWithRetry(
    url,
    { Accept: 'application/json', 'User-Agent': 'istochik-bible-seed/1.0' },
    'json',
  );
}

async function fetchText(url: string): Promise<string> {
  return (await fetchWithRetry(
    url,
    {
      Accept: 'text/html',
      'Accept-Encoding': 'identity',
      'User-Agent': 'Mozilla/5.0 (compatible; istochik-bible-seed/1.0)',
    },
    'text',
  )) as string;
}

async function chapterVerseCount(
  translationId: number,
  bookId: number,
  chapter: number,
): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::text AS c FROM bible_verses
     WHERE translation_id = $1 AND book_id = $2 AND chapter = $3`,
    [translationId, bookId, chapter],
  );
  return Number(r.rows[0]?.c ?? 0);
}

function mapNumberedObject(obj: Record<string, unknown>): Verse[] {
  return Object.entries(obj)
    .map(([k, v]) => ({ v: Number(k), t: String(v ?? '').trim() }))
    .filter((x) => Number.isInteger(x.v) && x.v > 0 && x.t)
    .sort((a, b) => a.v - b.v);
}

async function fetchSynodalFromFreeBible(bookSlug: string, chapter: number): Promise<Verse[]> {
  const url = `https://free.bible/bible/synodal/${bookSlug}/${chapter}.json`;
  const json = (await fetchJson(url)) as { verses?: Array<{ v: number; t: string }> };
  return (json.verses ?? [])
    .filter((v) => typeof v.v === 'number' && typeof v.t === 'string' && v.t.trim())
    .map((v) => ({ v: v.v, t: v.t.trim() }));
}

/**
 * Синодальный: primary = justbible.ru `rst` (доступен с RU VPS),
 * fallback = free.bible (часто ETIMEDOUT из РФ/СНГ).
 */
async function fetchSynodalChapter(book: BibleBookDef, chapter: number): Promise<Verse[]> {
  try {
    const verses = await fetchJustbibleChapter('rst', book, chapter);
    if (verses.length > 0) return verses;
  } catch (e) {
    console.warn(
      `[bible-seed] justbible rst failed ${book.slug}:${chapter} — fallback free.bible (${e instanceof Error ? e.message : e})`,
    );
  }
  return fetchSynodalFromFreeBible(book.slug, chapter);
}

async function fetchJustbibleChapter(
  translation: string,
  book: BibleBookDef,
  chapter: number,
): Promise<Verse[]> {
  const bookId = justbibleBookId(book);
  const url = `https://justbible.ru/api/bible?translation=${encodeURIComponent(translation)}&book=${bookId}&chapter=${chapter}`;
  const json = await fetchJson(url);
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`unexpected justbible payload for ${translation} ${book.slug}:${chapter}`);
  }
  const obj = json as Record<string, unknown>;
  if (obj.status === 'error' || obj.status === 'false' || obj.status === false || obj.error) {
    throw new Error(String(obj.error ?? 'justbible_error'));
  }
  // PHP warning / HTML вместо JSON уже отловит fetchJson; пустой объект — ошибка
  const verses = mapNumberedObject(obj);
  if (verses.length === 0) {
    throw new Error(`empty justbible chapter ${translation} ${book.slug}:${chapter}`);
  }
  return verses;
}

async function fetchBollsChapter(translation: string, bookOrd: number, chapter: number): Promise<Verse[]> {
  const url = `https://bolls.life/get-text/${encodeURIComponent(translation)}/${bookOrd}/${chapter}/`;
  const json = await fetchJson(url);
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error(`empty bolls chapter ${translation} ${bookOrd}:${chapter}`);
  }
  return (json as Array<{ verse?: number; text?: string }>)
    .map((row) => ({
      v: Number(row.verse),
      t: String(row.text ?? '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    }))
    .filter((x) => Number.isInteger(x.v) && x.v > 0 && x.t);
}

async function fetchAzbykaCassianChapter(bookSlug: string, chapter: number): Promise<Verse[]> {
  const code = AZBYKA_NT_CODES[bookSlug];
  if (!code) throw new Error(`no azbyka code for ${bookSlug}`);
  const url = `https://azbyka.ru/biblia/?${code}.${chapter}&b`;
  const html = await fetchText(url);
  const re =
    /<div\s+data-lang="b"\s+data-chapter="(\d+)"\s+data-line="(\d+)"\s+data-verse="[^"]+"\s+class="verse[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
  const verses: Verse[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const line = Number(m[2]);
    const text = m[3]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (Number.isInteger(line) && line > 0 && text) {
      verses.push({ v: line, t: text });
    }
  }
  if (verses.length === 0) {
    throw new Error(`no verses parsed from azbyka ${bookSlug}:${chapter}`);
  }
  return verses.sort((a, b) => a.v - b.v);
}

async function listBollsBookIds(translation: string): Promise<Set<number>> {
  const json = await fetchJson(`https://bolls.life/get-books/${encodeURIComponent(translation)}/`);
  if (!Array.isArray(json)) return new Set();
  return new Set(
    (json as Array<{ bookid?: number }>)
      .map((b) => Number(b.bookid))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
}

type Fetcher = (def: BibleBookDef, chapter: number) => Promise<Verse[]>;

async function buildFetcher(code: string): Promise<{
  def: BibleTranslationDef;
  fetcher: Fetcher;
  bookFilter?: (def: BibleBookDef) => boolean;
}> {
  const def = findTranslationDef(code);
  if (!def) throw new Error(`unknown_translation:${code}`);

  if (code === 'synodal') {
    return { def, fetcher: (book, ch) => fetchSynodalChapter(book, ch) };
  }
  if (code === 'rbo') {
    return { def, fetcher: (book, ch) => fetchJustbibleChapter('rbo', book, ch) };
  }
  if (code === 'desnitsky') {
    const available = await listBollsBookIds('DESN');
    return {
      def,
      fetcher: (book, ch) => fetchBollsChapter('DESN', book.ord, ch),
      bookFilter: (book) => available.has(book.ord),
    };
  }
  if (code === 'cassian') {
    return {
      def,
      fetcher: (book, ch) => fetchAzbykaCassianChapter(book.slug, ch),
      bookFilter: (book) => book.testament === 'nt' && Boolean(AZBYKA_NT_CODES[book.slug]),
    };
  }
  if (code === 'joyous-news') {
    throw new Error(
      'joyous-news: публичный источник для seed пока не подключён (каталог доступен без лицензии)',
    );
  }
  throw new Error(`no_fetcher:${code}`);
}

function resolveTranslationCodes(raw: string | null): string[] {
  const value = (raw ?? 'synodal').trim().toLowerCase();
  if (value === 'all') {
    return BIBLE_TRANSLATION_DEFS.map((t) => t.code).filter((c) => c !== 'joyous-news');
  }
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function seedOne(
  code: string,
  wanted: Set<string> | null,
  maxChapters: number | null,
  delayMs: number,
): Promise<void> {
  const { def, fetcher, bookFilter } = await buildFetcher(code);
  const catalog = await ensureCatalogTranslations();
  const translation = catalog.find((t) => t.code === code) as BibleTranslationRow | undefined;
  if (!translation) throw new Error(`translation_missing:${code}`);

  const books = await ensureTranslationBooks(translation.id, def.scope);
  const defs = BIBLE_BOOK_DEFS.filter((d) => {
    if (wanted && !wanted.has(d.slug)) return false;
    if (def.scope === 'nt' && d.testament !== 'nt') return false;
    if (bookFilter && !bookFilter(d)) return false;
    return books.has(d.slug);
  });

  console.log(`[bible-seed] translation=${code} books=${defs.length} scope=${def.scope}`);

  let chaptersOk = 0;
  let chaptersSkip = 0;
  let versesOk = 0;
  let chaptersFail = 0;
  const force = process.argv.includes('--force');

  for (const bookDef of defs) {
    const book = books.get(bookDef.slug) as BibleBookRow | undefined;
    if (!book) continue;
    const chapterLimit = maxChapters != null ? Math.min(bookDef.chapters, maxChapters) : bookDef.chapters;
    for (let ch = 1; ch <= chapterLimit; ch += 1) {
      try {
        // Не skip, если justbible-нумерация ≠ ord: раньше могли залить чужую книгу (Рим.←Иак.).
        const mustRefetch =
          force ||
          ((code === 'synodal' || code === 'rbo') && justbibleIdDiffersFromOrd(bookDef));
        if (!mustRefetch) {
          const existing = await chapterVerseCount(translation.id, book.id, ch);
          if (existing > 0) {
            chaptersSkip += 1;
            continue;
          }
        }
        const verses = await fetcher(bookDef, ch);
        if (!verses.length) {
          chaptersFail += 1;
          console.warn(`[bible-seed] empty ${code} ${bookDef.slug}:${ch}`);
          continue;
        }
        await upsertChapterVerses(translation.id, book.id, ch, verses);
        chaptersOk += 1;
        versesOk += verses.length;
        if (chaptersOk % 25 === 0) {
          console.log(
            `[bible-seed] progress ${code} ok=${chaptersOk} skip=${chaptersSkip} fail=${chaptersFail} last=${bookDef.slug}:${ch}`,
          );
        }
      } catch (e) {
        chaptersFail += 1;
        console.warn(
          `[bible-seed] failed ${code} ${bookDef.slug}:${ch}`,
          e instanceof Error ? e.message : e,
        );
        // после таймаута — чуть подождать, не долбить источник
        if (isTransientFetchError(e)) await sleep(Math.max(delayMs, 1500));
      }
      if (delayMs > 0) await sleep(delayMs);
    }
  }

  const total = await countVerses(translation.id);
  console.log(
    `[bible-seed] done ${code} ok=${chaptersOk} skip=${chaptersSkip} failed=${chaptersFail} verses_upserted=${versesOk} total_in_db=${total}`,
  );
}

async function main(): Promise<void> {
  const booksFilter = parseArg('books');
  const maxChaptersRaw = parseArg('max-chapters');
  const maxChapters = maxChaptersRaw ? Math.max(1, Number(maxChaptersRaw) || 0) : null;
  // free.bible / azbyka с некоторых VPS тормозят — пауза по умолчанию выше
  const delayMs = Number(parseArg('delay-ms') ?? process.env.BIBLE_SEED_DELAY_MS ?? '200');
  const codes = resolveTranslationCodes(parseArg('translation'));

  const wanted = booksFilter
    ? new Set(
        booksFilter
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;

  await ensureCatalogTranslations();

  for (const code of codes) {
    try {
      await seedOne(code, wanted, maxChapters, delayMs);
    } catch (e) {
      console.warn(`[bible-seed] skip ${code}:`, e);
    }
  }

  await ensureSampleLopukhinCommentary();
}

main()
  .catch((e) => {
    console.error('[bible-seed] fatal', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined);
  });
