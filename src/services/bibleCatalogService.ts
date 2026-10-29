import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';

export interface BibleTranslationRow {
  id: number;
  code: string;
  title: string;
  language: string;
  license_note: string;
}

export interface BibleBookRow {
  id: number;
  translation_id: number;
  ord: number;
  testament: string;
  slug: string;
  name: string;
  short_name: string;
  chapters_count: number;
}

export interface BibleVerseRow {
  verse: number;
  text: string;
}

const SYNODAL = {
  code: 'synodal',
  title: 'Синодальный перевод',
  language: 'ru',
  license_note: 'Public domain (Синодальный перевод, 1876). Источник: Free.Bible / eBible.',
};

export async function ensureSynodalTranslation(): Promise<BibleTranslationRow> {
  await ensureBibleSchema();
  const existing = await query(
    `SELECT id, code, title, language, license_note FROM bible_translations WHERE code = $1 LIMIT 1`,
    [SYNODAL.code],
  );
  if (existing.rows[0]) return existing.rows[0] as BibleTranslationRow;

  const inserted = await query(
    `INSERT INTO bible_translations (code, title, language, license_note)
     VALUES ($1, $2, $3, $4)
     RETURNING id, code, title, language, license_note`,
    [SYNODAL.code, SYNODAL.title, SYNODAL.language, SYNODAL.license_note],
  );
  return inserted.rows[0] as BibleTranslationRow;
}

export async function ensureSynodalBooks(translationId: number): Promise<Map<string, BibleBookRow>> {
  await ensureBibleSchema();
  const map = new Map<string, BibleBookRow>();
  for (const def of BIBLE_BOOK_DEFS) {
    const upserted = await query(
      `INSERT INTO bible_books (translation_id, ord, testament, slug, name, short_name, chapters_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (translation_id, slug) DO UPDATE SET
         ord = EXCLUDED.ord,
         testament = EXCLUDED.testament,
         name = EXCLUDED.name,
         short_name = EXCLUDED.short_name,
         chapters_count = EXCLUDED.chapters_count
       RETURNING id, translation_id, ord, testament, slug, name, short_name, chapters_count`,
      [translationId, def.ord, def.testament, def.slug, def.nameRu, def.shortNameRu, def.chapters],
    );
    map.set(def.slug, upserted.rows[0]!);
  }
  return map;
}

export async function listTranslations(): Promise<BibleTranslationRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT id, code, title, language, license_note FROM bible_translations ORDER BY id`,
  );
  return r.rows;
}

export async function getTranslationByCode(code: string): Promise<BibleTranslationRow | null> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT id, code, title, language, license_note FROM bible_translations WHERE code = $1 LIMIT 1`,
    [code],
  );
  return r.rows[0] ?? null;
}

export async function listBooks(translationCode: string): Promise<BibleBookRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT b.id, b.translation_id, b.ord, b.testament, b.slug, b.name, b.short_name, b.chapters_count
     FROM bible_books b
     JOIN bible_translations t ON t.id = b.translation_id
     WHERE t.code = $1
     ORDER BY b.ord`,
    [translationCode],
  );
  return r.rows;
}

export async function getBookBySlug(
  translationCode: string,
  slug: string,
): Promise<BibleBookRow | null> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT b.id, b.translation_id, b.ord, b.testament, b.slug, b.name, b.short_name, b.chapters_count
     FROM bible_books b
     JOIN bible_translations t ON t.id = b.translation_id
     WHERE t.code = $1 AND b.slug = $2
     LIMIT 1`,
    [translationCode, slug],
  );
  return r.rows[0] ?? null;
}

export async function getChapterVerses(
  translationCode: string,
  bookSlug: string,
  chapter: number,
): Promise<{
  translation: BibleTranslationRow;
  book: BibleBookRow;
  chapter: number;
  verses: BibleVerseRow[];
} | null> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(translationCode);
  if (!translation) return null;
  const book = await getBookBySlug(translationCode, bookSlug);
  if (!book) return null;
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters_count) return null;

  const verses = await query(
    `SELECT verse, text FROM bible_verses
     WHERE translation_id = $1 AND book_id = $2 AND chapter = $3
     ORDER BY verse`,
    [translation.id, book.id, chapter],
  );

  return { translation, book, chapter, verses: verses.rows };
}

export async function searchVerses(
  translationCode: string,
  q: string,
  limit = 40,
): Promise<
  Array<{
    book_slug: string;
    book_name: string;
    short_name: string;
    chapter: number;
    verse: number;
    text: string;
  }>
> {
  await ensureBibleSchema();
  const needle = q.trim();
  if (needle.length < 2) return [];
  const capped = Math.min(100, Math.max(1, Math.floor(limit)));

  const r = await query(
    `SELECT b.slug AS book_slug, b.name AS book_name, b.short_name, v.chapter, v.verse, v.text
     FROM bible_verses v
     JOIN bible_books b ON b.id = v.book_id
     JOIN bible_translations t ON t.id = v.translation_id
     WHERE t.code = $1 AND v.text ILIKE '%' || $2 || '%'
     ORDER BY b.ord, v.chapter, v.verse
     LIMIT $3`,
    [translationCode, needle, capped],
  );
  return r.rows;
}

export async function countVerses(translationId: number): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::text AS c FROM bible_verses WHERE translation_id = $1`,
    [translationId],
  );
  return Number(r.rows[0]?.c ?? 0);
}

export async function upsertChapterVerses(
  translationId: number,
  bookId: number,
  chapter: number,
  verses: Array<{ v: number; t: string }>,
): Promise<void> {
  await ensureBibleSchema();
  for (const verse of verses) {
    const text = String(verse.t ?? '').trim();
    if (!text) continue;
    await query(
      `INSERT INTO bible_verses (translation_id, book_id, chapter, verse, text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (translation_id, book_id, chapter, verse)
       DO UPDATE SET text = EXCLUDED.text`,
      [translationId, bookId, chapter, verse.v, text],
    );
  }
}

export async function getReadingProgress(
  memberId: number,
  translationCode: string,
): Promise<{
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse: number;
  updated_at: string;
} | null> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT b.slug AS book_slug, b.name AS book_name, b.short_name,
            p.chapter, p.verse, p.updated_at::text
     FROM bible_reading_progress p
     JOIN bible_translations t ON t.id = p.translation_id
     JOIN bible_books b ON b.id = p.book_id
     WHERE p.member_id = $1 AND t.code = $2
     LIMIT 1`,
    [memberId, translationCode],
  );
  return r.rows[0] ?? null;
}

export async function saveReadingProgress(input: {
  memberId: number;
  translationCode: string;
  bookSlug: string;
  chapter: number;
  verse: number;
}): Promise<void> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');

  await query(
    `INSERT INTO bible_reading_progress (member_id, translation_id, book_id, chapter, verse, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (member_id, translation_id) DO UPDATE SET
       book_id = EXCLUDED.book_id,
       chapter = EXCLUDED.chapter,
       verse = EXCLUDED.verse,
       updated_at = NOW()`,
    [input.memberId, translation.id, book.id, input.chapter, input.verse],
  );
}
