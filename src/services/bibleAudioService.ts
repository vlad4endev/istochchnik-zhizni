import fs from 'fs';
import path from 'path';

import { query } from '../config/db';
import { ensureBibleSchema } from './bibleSchema';
import { getBookBySlug, getChapterVerses, getTranslationByCode } from './bibleCatalogService';
import { verseFromTimings } from '../bible/bibleRefParser';

export interface BibleAudioTiming {
  v: number;
  start: number;
  end: number;
}

export interface BibleAudioChapterRow {
  id: number;
  translation_code: string;
  book_slug: string;
  chapter: number;
  audio_url: string;
  timings: BibleAudioTiming[];
  voice_id: string;
  duration_sec: number;
}

function parseTimings(raw: unknown): BibleAudioTiming[] {
  if (!Array.isArray(raw)) return [];
  const out: BibleAudioTiming[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const v = Number(o.v);
    const start = Number(o.start);
    const end = Number(o.end);
    if (!Number.isInteger(v) || !Number.isFinite(start)) continue;
    out.push({
      v,
      start,
      end: Number.isFinite(end) ? end : start + 1,
    });
  }
  return out;
}

export async function getChapterAudio(
  translationCode: string,
  bookSlug: string,
  chapter: number,
  voiceId = 'default',
): Promise<BibleAudioChapterRow | null> {
  await ensureBibleSchema();
  const r = await query(
    `SELECT a.id, t.code AS translation_code, b.slug AS book_slug, a.chapter, a.audio_url,
            a.timings_json, a.voice_id, a.duration_sec
     FROM bible_audio_chapters a
     JOIN bible_translations t ON t.id = a.translation_id
     JOIN bible_books b ON b.id = a.book_id
     WHERE t.code = $1 AND b.slug = $2 AND a.chapter = $3 AND a.voice_id = $4
     LIMIT 1`,
    [translationCode, bookSlug, chapter, voiceId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    translation_code: row.translation_code,
    book_slug: row.book_slug,
    chapter: row.chapter,
    audio_url: row.audio_url,
    timings: parseTimings(row.timings_json),
    voice_id: row.voice_id,
    duration_sec: row.duration_sec,
  };
}

export async function upsertChapterAudio(input: {
  translationCode: string;
  bookSlug: string;
  chapter: number;
  audioUrl: string;
  timings: BibleAudioTiming[];
  voiceId?: string;
  durationSec: number;
}): Promise<BibleAudioChapterRow> {
  await ensureBibleSchema();
  const translation = await getTranslationByCode(input.translationCode);
  if (!translation) throw new Error('translation_not_found');
  const book = await getBookBySlug(input.translationCode, input.bookSlug);
  if (!book) throw new Error('book_not_found');
  const voiceId = input.voiceId ?? 'default';

  await query(
    `INSERT INTO bible_audio_chapters
       (translation_id, book_id, chapter, audio_url, timings_json, voice_id, duration_sec, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
     ON CONFLICT (translation_id, book_id, chapter, voice_id) DO UPDATE SET
       audio_url = EXCLUDED.audio_url,
       timings_json = EXCLUDED.timings_json,
       duration_sec = EXCLUDED.duration_sec,
       updated_at = NOW()`,
    [
      translation.id,
      book.id,
      input.chapter,
      input.audioUrl,
      JSON.stringify(input.timings),
      voiceId,
      input.durationSec,
    ],
  );

  const row = await getChapterAudio(input.translationCode, input.bookSlug, input.chapter, voiceId);
  if (!row) throw new Error('audio_upsert_failed');
  return row;
}

/**
 * Build estimated timings from verse text lengths (chars / cps).
 * Used when real TTS audio is produced verse-by-verse and concatenated,
 * or as a fallback map before TTS is available.
 */
export function buildTimingsFromVerses(
  verses: Array<{ verse: number; text: string }>,
  charsPerSecond = 14,
  pauseSec = 0.35,
): { timings: BibleAudioTiming[]; durationSec: number } {
  const timings: BibleAudioTiming[] = [];
  let cursor = 0;
  for (const v of verses) {
    const dur = Math.max(1.2, v.text.length / charsPerSecond);
    const start = cursor;
    const end = cursor + dur;
    timings.push({ v: v.verse, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
    cursor = end + pauseSec;
  }
  return { timings, durationSec: Number(cursor.toFixed(3)) };
}

export { verseFromTimings };

/** Generate timing metadata for a chapter and optionally write a silent placeholder marker file. */
export async function generateChapterAudioMetadata(input: {
  translationCode: string;
  bookSlug: string;
  chapter: number;
  voiceId?: string;
  uploadsDir?: string;
}): Promise<BibleAudioChapterRow> {
  const chapter = await getChapterVerses(input.translationCode, input.bookSlug, input.chapter);
  if (!chapter || chapter.verses.length === 0) {
    throw new Error('chapter_empty');
  }

  const { timings, durationSec } = buildTimingsFromVerses(chapter.verses);
  const voiceId = input.voiceId ?? 'estimate';
  const uploadsRoot = input.uploadsDir ?? path.resolve(process.cwd(), 'uploads', 'bible-audio');
  const relDir = path.join(input.translationCode, input.bookSlug);
  const absDir = path.join(uploadsRoot, relDir);
  fs.mkdirSync(absDir, { recursive: true });

  const fileName = `${input.chapter}.${voiceId}.json`;
  const metaPath = path.join(absDir, fileName);
  const audioUrl = `/uploads/bible-audio/${input.translationCode}/${input.bookSlug}/${input.chapter}.${voiceId}.json`;
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        note: 'Timings-only placeholder. Replace with concatenated TTS mp3 and update audio_url.',
        translation: input.translationCode,
        book: input.bookSlug,
        chapter: input.chapter,
        timings,
        duration_sec: durationSec,
      },
      null,
      2,
    ),
    'utf8',
  );

  return upsertChapterAudio({
    translationCode: input.translationCode,
    bookSlug: input.bookSlug,
    chapter: input.chapter,
    audioUrl,
    timings,
    voiceId,
    durationSec,
  });
}
