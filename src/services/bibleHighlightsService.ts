import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { getBookBySlug, getTranslationByCode } from './bibleCatalogService';

export const BIBLE_HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type BibleHighlightColor = (typeof BIBLE_HIGHLIGHT_COLORS)[number];

export interface BibleHighlightRow {
  id: number;
  member_id: number;
  translation_code: string;
  book_slug: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  color: BibleHighlightColor;
  created_at: string;
}

const HIGHLIGHT_SELECT = `
  SELECT h.id, h.member_id, t.code AS translation_code, b.slug AS book_slug,
         h.chapter, h.verse_start, h.verse_end, h.color, h.created_at::text
  FROM bible_highlights h
  JOIN bible_translations t ON t.id = h.translation_id
  JOIN bible_books b ON b.id = h.book_id
`;

function normalizeColor(color: unknown): BibleHighlightColor {
  return (BIBLE_HIGHLIGHT_COLORS as readonly string[]).includes(String(color))
    ? (color as BibleHighlightColor)
    : 'yellow';
}

export async function listBibleHighlightsForChapter(
  memberId: number,
  translationCode: string,
  bookSlug: string,
  chapter: number,
): Promise<BibleHighlightRow[]> {
  await ensureBibleSchema();
  const r = await query(
    `${HIGHLIGHT_SELECT}
     WHERE h.member_id = $1 AND t.code = $2 AND b.slug = $3 AND h.chapter = $4
     ORDER BY h.verse_start, h.id`,
    [memberId, translationCode, bookSlug, chapter],
  );
  return r.rows;
}

export async function createBibleHighlight(
  memberId: number,
  input: {
    translationCode: string;
    bookSlug: string;
    chapter: number;
    verseStart: number;
    verseEnd?: number;
    color?: string;
  },
): Promise<BibleHighlightRow> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');

  const verseStart = Math.max(1, Math.floor(input.verseStart));
  const verseEnd = Math.max(verseStart, Math.floor(input.verseEnd ?? verseStart));
  const color = normalizeColor(input.color);

  const inserted = await query(
    `INSERT INTO bible_highlights
       (member_id, translation_id, book_id, chapter, verse_start, verse_end, color)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [memberId, translation.id, book.id, input.chapter, verseStart, verseEnd, color],
  );
  const row = await query(`${HIGHLIGHT_SELECT} WHERE h.id = $1 LIMIT 1`, [inserted.rows[0]!.id]);
  return row.rows[0];
}

export async function deleteBibleHighlight(memberId: number, id: number): Promise<boolean> {
  await ensureBibleSchema();
  const r = await query(`DELETE FROM bible_highlights WHERE id = $1 AND member_id = $2`, [
    id,
    memberId,
  ]);
  return (r.rowCount ?? 0) > 0;
}
