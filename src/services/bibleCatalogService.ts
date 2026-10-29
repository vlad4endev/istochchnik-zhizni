import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import {
  BIBLE_TRANSLATION_DEFS,
  type BibleTranslationAvailability,
  type BibleTranslationScope,
} from '../bible/bibleTranslationCatalog';
import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';

export interface BibleTranslationRow {
  id: number;
  code: string;
  title: string;
  short_title: string;
  description: string;
  year: string | null;
  language: string;
  scope: BibleTranslationScope;
  availability: BibleTranslationAvailability;
  license_note: string;
  sort_order: number;
  verse_count?: number;
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

const TRANSLATION_SELECT = `
  id, code, title, short_title, description, year, language, scope, availability, license_note, sort_order
`;

function mapTranslationRow(row: Record<string, unknown>): BibleTranslationRow {
  return {
    id: Number(row.id),
    code: String(row.code),
    title: String(row.title),
    short_title: String(row.short_title ?? ''),
    description: String(row.description ?? ''),
    year: row.year != null && String(row.year).trim() ? String(row.year) : null,
    language: String(row.language ?? 'ru'),
    scope: (row.scope === 'nt' || row.scope === 'partial' ? row.scope : 'full') as BibleTranslationScope,
    availability: (row.availability === 'license_required' ? 'license_required' : 'available') as BibleTranslationAvailability,
    license_note: String(row.license_note ?? ''),
    sort_order: Number(row.sort_order ?? 100),
    ...(row.verse_count != null ? { verse_count: Number(row.verse_count) } : {}),
  };
}

export async function ensureTranslationBooks(
  translationId: number,
  scope: BibleTranslationScope,
): Promise<Map<string, BibleBookRow>> {
  await ensureBibleSchema();
  const map = new Map<string, BibleBookRow>();
  // nt — только НЗ; partial/full — полный скелет 66 книг (partial может быть неполным по стихам)
  const defs = scope === 'nt' ? BIBLE_BOOK_DEFS.filter((d) => d.testament === 'nt') : BIBLE_BOOK_DEFS;
  for (const def of defs) {
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
    map.set(def.slug, upserted.rows[0]! as BibleBookRow);
  }
  return map;
}

/** Upsert all catalog translations + book skeletons (NT-only where needed). */
export async function ensureCatalogTranslations(): Promise<BibleTranslationRow[]> {
  await ensureBibleSchema();
  const out: BibleTranslationRow[] = [];
  for (const def of BIBLE_TRANSLATION_DEFS) {
    const upserted = await query(
      `INSERT INTO bible_translations
         (code, title, short_title, description, year, language, scope, availability, license_note, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (code) DO UPDATE SET
         title = EXCLUDED.title,
         short_title = EXCLUDED.short_title,
         description = EXCLUDED.description,
         year = EXCLUDED.year,
         language = EXCLUDED.language,
         scope = EXCLUDED.scope,
         availability = EXCLUDED.availability,
         license_note = EXCLUDED.license_note,
         sort_order = EXCLUDED.sort_order
       RETURNING ${TRANSLATION_SELECT}`,
      [
        def.code,
        def.title,
        def.shortTitle,
        def.description,
        def.year,
        def.language,
        def.scope,
        def.availability,
        def.licenseNote,
        def.sortOrder,
      ],
    );
    const row = mapTranslationRow(upserted.rows[0] as Record<string, unknown>);
    await ensureTranslationBooks(row.id, def.scope);
    out.push(row);
  }
  return out;
}

export async function ensureSynodalTranslation(): Promise<BibleTranslationRow> {
  const all = await ensureCatalogTranslations();
  const synodal = all.find((t) => t.code === 'synodal');
  if (!synodal) throw new Error('synodal_missing');
  return synodal;
}

export async function ensureSynodalBooks(translationId: number): Promise<Map<string, BibleBookRow>> {
  return ensureTranslationBooks(translationId, 'full');
}

export async function listTranslations(): Promise<BibleTranslationRow[]> {
  await ensureCatalogTranslations();
  const r = await query(
    `SELECT ${TRANSLATION_SELECT},
            (SELECT COUNT(*)::int FROM bible_verses v WHERE v.translation_id = t.id) AS verse_count
     FROM bible_translations t
     ORDER BY sort_order, id`,
  );
  return r.rows.map((row) => mapTranslationRow(row as Record<string, unknown>));
}

export async function getTranslationByCode(code: string): Promise<BibleTranslationRow | null> {
  await ensureCatalogTranslations();
  const r = await query(
    `SELECT ${TRANSLATION_SELECT},
            (SELECT COUNT(*)::int FROM bible_verses v WHERE v.translation_id = t.id) AS verse_count
     FROM bible_translations t
     WHERE code = $1
     LIMIT 1`,
    [code],
  );
  const row = r.rows[0];
  return row ? mapTranslationRow(row as Record<string, unknown>) : null;
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

  return {
    translation,
    book,
    chapter,
    verses: verses.rows as BibleVerseRow[],
  };
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
