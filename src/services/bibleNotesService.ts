import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { getBookBySlug, getTranslationByCode } from './bibleCatalogService';

export interface BibleNoteRow {
  id: number;
  member_id: number;
  translation_code: string;
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  body: string;
  created_at: string;
  updated_at: string;
}

const NOTE_SELECT = `
  SELECT n.id, n.member_id, t.code AS translation_code, b.slug AS book_slug, b.name AS book_name,
         b.short_name, n.chapter, n.verse_start, n.verse_end, n.body,
         n.created_at::text, n.updated_at::text
  FROM bible_notes n
  JOIN bible_translations t ON t.id = n.translation_id
  JOIN bible_books b ON b.id = n.book_id
`;

export async function listBibleNotes(memberId: number): Promise<BibleNoteRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${NOTE_SELECT} WHERE n.member_id = $1 ORDER BY n.updated_at DESC LIMIT 500`,
    [memberId],
  );
  return r.rows;
}

export async function listBibleNotesForChapter(
  memberId: number,
  translationCode: string,
  bookSlug: string,
  chapter: number,
): Promise<BibleNoteRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${NOTE_SELECT}
     WHERE n.member_id = $1 AND t.code = $2 AND b.slug = $3 AND n.chapter = $4
     ORDER BY n.verse_start, n.id`,
    [memberId, translationCode, bookSlug, chapter],
  );
  return r.rows;
}

export async function createBibleNote(
  memberId: number,
  input: {
    translationCode: string;
    bookSlug: string;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
    body: string;
  },
): Promise<BibleNoteRow> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');

  const verseStart = Math.max(1, Math.floor(input.verseStart));
  const verseEnd = Math.max(verseStart, Math.floor(input.verseEnd ?? verseStart));
  const body = String(input.body ?? '').trim();

  const inserted = await query(
    `INSERT INTO bible_notes
       (member_id, translation_id, book_id, chapter, verse_start, verse_end, body)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [memberId, translation.id, book.id, input.chapter, verseStart, verseEnd, body],
  );
  const note = await getBibleNote(memberId, inserted.rows[0]!.id);
  if (!note) throw new Error('note_create_failed');
  return note;
}

export async function getBibleNote(memberId: number, id: number): Promise<BibleNoteRow | null> {
  await ensureBibleSchema();
  const r = await query(`${NOTE_SELECT} WHERE n.id = $1 AND n.member_id = $2 LIMIT 1`, [
    id,
    memberId,
  ]);
  return r.rows[0] ?? null;
}

export async function updateBibleNote(
  memberId: number,
  id: number,
  input: { body?: string; verseStart?: number; verseEnd?: number },
): Promise<BibleNoteRow | null> {
  await ensureBibleSchema();
  const existing = await getBibleNote(memberId, id);
  if (!existing) return null;

  const body = input.body != null ? String(input.body).trim() : existing.body;
  const verseStart =
    input.verseStart != null ? Math.max(1, Math.floor(input.verseStart)) : existing.verse_start;
  const verseEnd =
    input.verseEnd != null
      ? Math.max(verseStart, Math.floor(input.verseEnd))
      : Math.max(verseStart, existing.verse_end);

  await query(
    `UPDATE bible_notes SET body = $1, verse_start = $2, verse_end = $3, updated_at = NOW()
     WHERE id = $4 AND member_id = $5`,
    [body, verseStart, verseEnd, id, memberId],
  );
  return getBibleNote(memberId, id);
}

export async function deleteBibleNote(memberId: number, id: number): Promise<boolean> {
  await ensureBibleSchema();
  const r = await query(`DELETE FROM bible_notes WHERE id = $1 AND member_id = $2`, [id, memberId]);
  return (r.rowCount ?? 0) > 0;
}
