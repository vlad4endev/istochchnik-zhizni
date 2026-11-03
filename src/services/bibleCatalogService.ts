import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import {
  BIBLE_TRANSLATION_DEFS,
  type BibleTranslationAvailability,
  type BibleTranslationScope,
} from '../bible/bibleTranslationCatalog';
import { VERSE_OF_DAY_REFS } from '../bible/verseOfDayRefs';
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

const BOOK_SELECT = `id, translation_id, ord, testament, slug, name, short_name, chapters_count`;

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

  // Read-first: в steady state (все книги уже есть) не тратим sequence и не пишем строки.
  // Раньше upsert DO UPDATE на каждый запрос сжигал bible_books_id_seq (smallint, 32767).
  const existing = await query(
    `SELECT ${BOOK_SELECT} FROM bible_books WHERE translation_id = $1`,
    [translationId],
  );
  const bySlug = new Map<string, BibleBookRow>();
  for (const row of existing.rows as BibleBookRow[]) {
    bySlug.set(String(row.slug), row);
  }

  for (const def of defs) {
    let row = bySlug.get(def.slug) ?? undefined;
    if (!row) {
      // Новая книга — единственное место, где тратится sequence
      const upserted = await query(
        `INSERT INTO bible_books (translation_id, ord, testament, slug, name, short_name, chapters_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (translation_id, slug) DO UPDATE SET
           ord = EXCLUDED.ord,
           testament = EXCLUDED.testament,
           name = EXCLUDED.name,
           short_name = EXCLUDED.short_name,
           chapters_count = EXCLUDED.chapters_count
         RETURNING ${BOOK_SELECT}`,
        [translationId, def.ord, def.testament, def.slug, def.nameRu, def.shortNameRu, def.chapters],
      );
      row = upserted.rows[0] as BibleBookRow | undefined;
    } else if (
      String(row.testament) !== def.testament ||
      String(row.name) !== def.nameRu ||
      String(row.short_name) !== def.shortNameRu ||
      Number(row.chapters_count) !== def.chapters
    ) {
      try {
        const updated = await query(
          `UPDATE bible_books
           SET ord = $1, testament = $2, name = $3, short_name = $4, chapters_count = $5
           WHERE translation_id = $6 AND slug = $7
           RETURNING ${BOOK_SELECT}`,
          [def.ord, def.testament, def.nameRu, def.shortNameRu, def.chapters, translationId, def.slug],
        );
        row = (updated.rows[0] as BibleBookRow | undefined) ?? row;
      } catch {
        // UNIQUE(translation_id, ord) не даёт менять ord по одной строке; ord из тех же defs и не дрейфает — синхронизируем остальное.
        const updated = await query(
          `UPDATE bible_books
           SET testament = $1, name = $2, short_name = $3, chapters_count = $4
           WHERE translation_id = $5 AND slug = $6
           RETURNING ${BOOK_SELECT}`,
          [def.testament, def.nameRu, def.shortNameRu, def.chapters, translationId, def.slug],
        );
        row = (updated.rows[0] as BibleBookRow | undefined) ?? row;
      }
    }
    if (row) map.set(def.slug, row);
  }
  return map;
}

/** Upsert catalog translations + book skeletons (NT-only where needed). */
export async function ensureCatalogTranslations(): Promise<BibleTranslationRow[]> {
  await ensureBibleSchema();

  // Read-first: переводы почти всегда уже в БД — не сжигаем sequence и не пишем на каждый запрос.
  const existing = await query(
    `SELECT ${TRANSLATION_SELECT} FROM bible_translations`,
  );
  const byCode = new Map<string, Record<string, unknown>>();
  for (const raw of existing.rows as Array<Record<string, unknown>>) {
    byCode.set(String(raw.code), raw);
  }

  const out: BibleTranslationRow[] = [];
  for (const def of BIBLE_TRANSLATION_DEFS) {
    const existingRow = byCode.get(def.code);
    let row: BibleTranslationRow;
    if (!existingRow) {
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
      row = mapTranslationRow(upserted.rows[0] as Record<string, unknown>);
    } else {
      const current = mapTranslationRow(existingRow);
      const drift =
        current.title !== def.title ||
        current.short_title !== def.shortTitle ||
        current.description !== def.description ||
        current.year !== def.year ||
        current.language !== def.language ||
        current.scope !== def.scope ||
        current.availability !== def.availability ||
        current.license_note !== def.licenseNote ||
        Number(current.sort_order) !== def.sortOrder;
      if (drift) {
        const updated = await query(
          `UPDATE bible_translations SET
             title = $1, short_title = $2, description = $3, year = $4, language = $5,
             scope = $6, availability = $7, license_note = $8, sort_order = $9
           WHERE code = $10
           RETURNING ${TRANSLATION_SELECT}`,
          [
            def.title,
            def.shortTitle,
            def.description,
            def.year,
            def.language,
            def.scope,
            def.availability,
            def.licenseNote,
            def.sortOrder,
            def.code,
          ],
        );
        row = mapTranslationRow(updated.rows[0] as Record<string, unknown>);
      } else {
        row = current;
      }
    }
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

export interface BibleVerseOfDay {
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  text: string;
  date: string;
}

function dayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - startOfYear) / 86_400_000);
}

/**
 * Детерминированная ротация по дню года — все пользователи видят один и тот
 * же «стих дня» без внешнего API/датасета (см. verseOfDayRefs.ts).
 */
export async function getVerseOfDay(
  translationCode: string,
  date: Date = new Date(),
): Promise<BibleVerseOfDay | null> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(translationCode);
  if (!translation || VERSE_OF_DAY_REFS.length === 0) return null;

  const ref = VERSE_OF_DAY_REFS[dayOfYear(date) % VERSE_OF_DAY_REFS.length]!;
  const book = await getBookBySlug(translationCode, ref.bookSlug);
  if (!book) return null;

  const verseEnd = ref.verseEnd ?? ref.verseStart;
  const r = await query(
    `SELECT verse, text FROM bible_verses
     WHERE translation_id = $1 AND book_id = $2 AND chapter = $3 AND verse BETWEEN $4 AND $5
     ORDER BY verse`,
    [translation.id, book.id, ref.chapter, ref.verseStart, verseEnd],
  );
  if (r.rows.length === 0) return null;

  return {
    book_slug: book.slug,
    book_name: book.name,
    short_name: book.short_name,
    chapter: ref.chapter,
    verse_start: ref.verseStart,
    verse_end: verseEnd,
    text: r.rows.map((row) => String(row.text)).join(' '),
    date: date.toISOString().slice(0, 10),
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

  // Полнотекстовый поиск (русская морфология, ts_rank) — находит словоформы
  // («возлюбил» по запросу «любовь»), а не только точную подстроку.
  const fts = await query(
    `SELECT b.slug AS book_slug, b.name AS book_name, b.short_name, v.chapter, v.verse, v.text
     FROM bible_verses v
     JOIN bible_books b ON b.id = v.book_id
     JOIN bible_translations t ON t.id = v.translation_id
     WHERE t.code = $1 AND v.text_tsv @@ websearch_to_tsquery('russian', $2)
     ORDER BY ts_rank(v.text_tsv, websearch_to_tsquery('russian', $2)) DESC, b.ord, v.chapter, v.verse
     LIMIT $3`,
    [translationCode, needle, capped],
  );
  if (fts.rows.length > 0) return fts.rows;

  // Фолбэк на триграммы: короткие/частичные слова, опечатки, фрагменты имён —
  // то, что морфологический поиск по целым леммам не находит.
  const trgm = await query(
    `SELECT b.slug AS book_slug, b.name AS book_name, b.short_name, v.chapter, v.verse, v.text
     FROM bible_verses v
     JOIN bible_books b ON b.id = v.book_id
     JOIN bible_translations t ON t.id = v.translation_id
     WHERE t.code = $1 AND v.text ILIKE '%' || $2 || '%'
     ORDER BY similarity(v.text, $2) DESC, b.ord, v.chapter, v.verse
     LIMIT $3`,
    [translationCode, needle, capped],
  );
  return trgm.rows;
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
