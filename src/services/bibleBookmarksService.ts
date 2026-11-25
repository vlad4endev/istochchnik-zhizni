import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { getBookBySlug, getTranslationByCode } from './bibleCatalogService';

export interface BibleBookmarkRow {
  id: number;
  member_id: number;
  translation_code: string;
  book_slug: string;
  book_name: string;
  short_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  created_at: string;
}

const BOOKMARK_SELECT = `
  SELECT m.id, m.member_id, t.code AS translation_code, b.slug AS book_slug, b.name AS book_name,
         b.short_name, m.chapter, m.verse_start, m.verse_end, m.created_at::text
  FROM bible_bookmarks m
  JOIN bible_translations t ON t.id = m.translation_id
  JOIN bible_books b ON b.id = m.book_id
`;

export async function listBibleBookmarks(memberId: number): Promise<BibleBookmarkRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${BOOKMARK_SELECT} WHERE m.member_id = $1 ORDER BY m.created_at DESC LIMIT 500`,
    [memberId],
  );
  return r.rows;
}

export async function listBibleBookmarksForChapter(
  memberId: number,
  translationCode: string,
  bookSlug: string,
  chapter: number,
): Promise<BibleBookmarkRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${BOOKMARK_SELECT}
     WHERE m.member_id = $1 AND t.code = $2 AND b.slug = $3 AND m.chapter = $4
     ORDER BY m.verse_start, m.id`,
    [memberId, translationCode, bookSlug, chapter],
  );
  return r.rows;
}

export async function createBibleBookmark(
  memberId: number,
  input: {
    translationCode: string;
    bookSlug: string;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
  },
): Promise<BibleBookmarkRow> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');

  const verseStart = Math.max(1, Math.floor(input.verseStart));
  const verseEnd = Math.max(verseStart, Math.floor(input.verseEnd ?? verseStart));

  // ON CONFLICT: повторная закладка на тот же диапазон не плодит дубликаты.
  const inserted = await query(
    `INSERT INTO bible_bookmarks
       (member_id, translation_id, book_id, chapter, verse_start, verse_end)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (member_id, translation_id, book_id, chapter, verse_start, verse_end)
     DO UPDATE SET created_at = bible_bookmarks.created_at
     RETURNING id`,
    [memberId, translation.id, book.id, input.chapter, verseStart, verseEnd],
  );
  const r = await query(`${BOOKMARK_SELECT} WHERE m.id = $1 LIMIT 1`, [inserted.rows[0]!.id]);
  const bookmark = r.rows[0] as BibleBookmarkRow | undefined;
  if (!bookmark) throw new Error('bookmark_create_failed');
  return bookmark;
}

export async function deleteBibleBookmark(memberId: number, id: number): Promise<boolean> {
  await ensureBibleSchema();
  const r = await query(`DELETE FROM bible_bookmarks WHERE id = $1 AND member_id = $2`, [
    id,
    memberId,
  ]);
  return (r.rowCount ?? 0) > 0;
}
