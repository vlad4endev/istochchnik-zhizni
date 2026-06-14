import { pool } from '../config/db';
import { slugifyTitle } from '../services/songService';
import type { ImportProgress, ImportResult, ParsedXlsxSong } from './types';
import { fetchTelegraphTextDetailed } from './telegraphParser';
import { smartImportTextToChordPro } from './smartImportToChordPro';

const TAG_MISSING_TEXT = 'нет_текста';
export const TAG_IMPORTED = 'импортированная';
/** Совпадает с частью строк в БД из внешних импортов. */
const TAG_IMPORTED_LEGACY = 'импортировано';

function looksLikeChordsLink(url: string): boolean {
  // Heuristic: in the source xlsx usually "with chords" is stored in url_chords column.
  // Still, we keep it generic: any telegra.ph link counts as usable.
  return typeof url === 'string' && url.trim().startsWith('https://');
}

function dedupePreferChords(
  rows: ParsedXlsxSong[],
): { songs: ParsedXlsxSong[]; skipped: number } {
  // external_id is ignored; primary identity is song_number.
  const byKey = new Map<number, ParsedXlsxSong>();
  let skipped = 0;

  for (const r of rows) {
    const key = r.song_number;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, r);
      continue;
    }

    // Prefer the row that has a "better" chords source (url_chords present).
    const prevHasChords = looksLikeChordsLink(prev.url_chords);
    const curHasChords = looksLikeChordsLink(r.url_chords);

    let pick = prev;
    let other = r;
    if (curHasChords && !prevHasChords) {
      pick = r;
      other = prev;
    }

    // Merge: keep preferred row as base, but backfill missing urls from the other.
    const merged: ParsedXlsxSong = {
      ...pick,
      url_lyrics: pick.url_lyrics?.trim() ? pick.url_lyrics : other.url_lyrics,
      url_chords: pick.url_chords?.trim() ? pick.url_chords : other.url_chords,
      url_youtube: pick.url_youtube?.trim() ? pick.url_youtube : other.url_youtube,
      table_of_contents: pick.table_of_contents?.trim() ? pick.table_of_contents : other.table_of_contents,
      // external_id: keep from preferred (chords version), so DB upsert doesn't create duplicates
    };

    byKey.set(key, merged);
    skipped += 1;
  }

  return { songs: Array.from(byKey.values()), skipped };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ImportManagerOptions = {
  /** delay between Telegraph requests */
  requestDelayMs?: number;
  onProgress?: (p: ImportProgress) => void;
  createdByMemberId: number;
};

export async function importSongsFromXlsxRows(
  songs: ParsedXlsxSong[],
  options: ImportManagerOptions,
): Promise<ImportResult> {
  const requestDelayMs = Math.max(300, Math.floor(options.requestDelayMs ?? 1500));
  const deduped = dedupePreferChords(songs);
  const effectiveSongs = deduped.songs;
  const total = effectiveSongs.length;
  const onProgress = options.onProgress;

  const errors: ImportResult['errors'] = [];
  let success = 0;
  let failed = 0;
  let skipped = deduped.skipped;
  let placeholders = 0;

  if (!pool) {
    throw new Error('DATABASE_URL is not set');
  }

  for (let idx = 0; idx < effectiveSongs.length; idx += 1) {
    const row = effectiveSongs[idx]!;
    const current = idx + 1;

    onProgress?.({ current, total, song_title: row.title, status: 'fetching' });

    let needsRetry = false;
    let lyricsText: string | null = null;
    let chordsText: string | null = null;

    // fetch lyrics
    if (row.url_lyrics?.trim()) {
      const lyr = await fetchTelegraphTextDetailed(row.url_lyrics);
      if (lyr.ok) {
        lyricsText = lyr.text;
      } else {
        needsRetry = needsRetry || lyr.needsRetry;
        if (lyr.retryAfterMs) await sleep(lyr.retryAfterMs);
      }
      await sleep(requestDelayMs);
    }

    // fetch chords
    if (row.url_chords?.trim()) {
      const chr = await fetchTelegraphTextDetailed(row.url_chords);
      if (chr.ok) {
        chordsText = chr.text;
      } else {
        needsRetry = needsRetry || chr.needsRetry;
        if (chr.retryAfterMs) await sleep(chr.retryAfterMs);
      }
      await sleep(requestDelayMs);
    }

    onProgress?.({ current, total, song_title: row.title, status: 'saving' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ id: string; tags: string[]; is_published: boolean }>(
        'SELECT id, tags, is_published FROM songs WHERE song_number = $1 LIMIT 1',
        [row.song_number],
      );
      const sourceText = (chordsText ?? lyricsText ?? '').trimEnd();
      const content = smartImportTextToChordPro(sourceText).trimEnd() || sourceText;
      const isPlaceholder = !content.trim();
      const importedTags = isPlaceholder ? [TAG_IMPORTED, TAG_MISSING_TEXT] : [TAG_IMPORTED];
      /** Импорт — в песочницу студии; в общий песенник — через «Опубликовать» или импорт с текстом (готово). */
      const publishInCatalog = !isPlaceholder;
      if (isPlaceholder) placeholders += 1;

      let songId: number;

      if (existing.rows[0]?.id) {
        const existingTags = (existing.rows[0].tags ?? []) as unknown as string[];
        const isStillImported =
          Array.isArray(existingTags) &&
          (existingTags.includes(TAG_IMPORTED) || existingTags.includes(TAG_IMPORTED_LEGACY));
        if (!isStillImported) {
          // Песня уже в каталоге (опубликована/редактируется вручную) — не трогаем.
          await client.query('COMMIT');
          skipped += 1;
          onProgress?.({ current, total, song_title: row.title, status: 'done', message: 'уже в каталоге' });
          continue;
        }
        songId = Number(existing.rows[0].id);
        await client.query(
          `UPDATE songs
           SET title = $2,
               content = $3,
               tags = (SELECT ARRAY(SELECT DISTINCT unnest(songs.tags || $4::text[]))),
               is_published = $5,
               imported_at = COALESCE(imported_at, NOW()),
               updated_at = NOW()
           WHERE song_number = $1`,
          [row.song_number, row.title, content, importedTags, publishInCatalog],
        );
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO songs (
             song_number, title, slug, content, tags, is_published, created_by_member_id, imported_at
           )
           VALUES ($1,$2,gen_random_uuid()::text,$3,$4,$5,$6,NOW())
           RETURNING id`,
          [
            row.song_number,
            row.title,
            content,
            importedTags,
            publishInCatalog,
            options.createdByMemberId,
          ],
        );
        songId = Number(ins.rows[0]!.id);
        const slug = `${slugifyTitle(row.title)}-${songId}`;
        await client.query('UPDATE songs SET slug = $1, updated_at = NOW() WHERE id = $2', [slug, songId]);
      }

      await client.query('COMMIT');
      success += 1;
      onProgress?.({ current, total, song_title: row.title, status: 'done' });
    } catch (e) {
      await client.query('ROLLBACK');
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ song_number: row.song_number, title: row.title, error: msg || 'Ошибка сохранения' });
      onProgress?.({ current, total, song_title: row.title, status: 'error', message: msg });
    } finally {
      client.release();
    }
  }

  return { success, failed, skipped, placeholders, errors };
}

