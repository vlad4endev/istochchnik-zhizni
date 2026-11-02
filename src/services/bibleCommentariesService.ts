import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { getBookBySlug, getTranslationByCode } from './bibleCatalogService';

export interface BibleCommentaryRow {
  id: number;
  source: 'lopukhin' | 'church';
  book_slug: string;
  book_name: string;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  title: string;
  body: string;
  author_member_id: number | null;
  visibility: string;
  created_at: string;
  updated_at: string;
}

const SELECT = `
  SELECT c.id, c.source, b.slug AS book_slug, b.name AS book_name, c.chapter,
         c.verse_start, c.verse_end, c.title, c.body, c.author_member_id, c.visibility,
         c.created_at::text, c.updated_at::text
  FROM bible_commentaries c
  JOIN bible_books b ON b.id = c.book_id
`;

export async function listCommentariesForChapter(
  translationCode: string,
  bookSlug: string,
  chapter: number,
): Promise<BibleCommentaryRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${SELECT}
     JOIN bible_translations t ON t.id = b.translation_id
     WHERE t.code = $1 AND b.slug = $2 AND c.chapter = $3
       AND (c.visibility = 'public' OR c.source = 'lopukhin')
     ORDER BY c.source, c.verse_start NULLS FIRST, c.id`,
    [translationCode, bookSlug, chapter],
  );
  return r.rows;
}

export async function upsertLopukhinCommentary(input: {
  translationCode: string;
  bookSlug: string;
  chapter: number;
  verseStart?: number | null;
  verseEnd?: number | null;
  title?: string;
  body: string;
}): Promise<void> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');
  const body = input.body.trim();
  if (!body) return;

  await query(
    `INSERT INTO bible_commentaries
       (source, translation_id, book_id, chapter, verse_start, verse_end, title, body, visibility)
     VALUES ('lopukhin', $1, $2, $3, $4, $5, $6, $7, 'public')`,
    [
      translation.id,
      book.id,
      input.chapter,
      input.verseStart ?? null,
      input.verseEnd ?? null,
      (input.title ?? '').slice(0, 500),
      body,
    ],
  );
}

export async function createChurchCommentary(
  authorMemberId: number,
  input: {
    translationCode: string;
    bookSlug: string;
    chapter: number;
    verseStart?: number | null;
    verseEnd?: number | null;
    title?: string;
    body: string;
  },
): Promise<BibleCommentaryRow> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');

  const inserted = await query(
    `INSERT INTO bible_commentaries
       (source, translation_id, book_id, chapter, verse_start, verse_end, title, body, author_member_id, visibility)
     VALUES ('church', $1, $2, $3, $4, $5, $6, $7, $8, 'public')
     RETURNING id`,
    [
      translation.id,
      book.id,
      input.chapter,
      input.verseStart ?? null,
      input.verseEnd ?? null,
      (input.title ?? '').slice(0, 500),
      input.body.trim(),
      authorMemberId,
    ],
  );

  const r = await query(`${SELECT} WHERE c.id = $1 LIMIT 1`, [inserted.rows[0]!.id]);
  return r.rows[0]!;
}

export async function deleteChurchCommentary(id: number, authorMemberId?: number): Promise<boolean> {
  await ensureBibleSchema();
  if (authorMemberId != null) {
    const r = await query(
      `DELETE FROM bible_commentaries WHERE id = $1 AND source = 'church' AND author_member_id = $2`,
      [id, authorMemberId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  const r = await query(`DELETE FROM bible_commentaries WHERE id = $1 AND source = 'church'`, [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Seed a small sample Lopukhin-style note for John 3 if empty. */
export async function ensureSampleLopukhinCommentary(): Promise<void> {
  await ensureBibleSchema();
  const existing = await query(
    `SELECT COUNT(*)::text AS c FROM bible_commentaries WHERE source = 'lopukhin'`,
  );
  if (Number(existing.rows[0]?.c ?? 0) > 0) return;

  try {
    await upsertLopukhinCommentary({
      translationCode: 'synodal',
      bookSlug: 'john',
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      title: 'Ин 3:16 (Лопухин)',
      body:
        'Стих выражает сущность Евангелия: любовь Божия к миру явлена в даровании Сына, чтобы верующий имел жизнь вечную. «Мир» здесь — человечество, нуждающееся в спасении. Вера — не только согласие ума, но живое упование на Христа.',
    });
  } catch {
    // Catalog may not be seeded yet
  }
}
