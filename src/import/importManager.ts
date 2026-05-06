import { pool } from '../config/db';
import { slugifyTitle } from '../services/songService';
import type { ImportProgress, ImportResult, ParsedXlsxSong } from './types';
import { fetchTelegraphTextDetailed } from './telegraphParser';

function normTitleForDedupe(title: string): string {
  return (title ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function looksLikeChordsLink(url: string): boolean {
  // Heuristic: in the source xlsx usually "with chords" is stored in url_chords column.
  // Still, we keep it generic: any telegra.ph link counts as usable.
  return typeof url === 'string' && url.trim().startsWith('https://');
}

function dedupePreferChords(
  rows: ParsedXlsxSong[],
): { songs: ParsedXlsxSong[]; skipped: number } {
  const byKey = new Map<string, ParsedXlsxSong>();
  let skipped = 0;

  for (const r of rows) {
    const key = `${r.song_number}|${normTitleForDedupe(r.title)}`;
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

function nowIso(): string {
  return new Date().toISOString();
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

  const seenExternal = new Set<string>();
  const errors: ImportResult['errors'] = [];
  let success = 0;
  let failed = 0;
  let skipped = deduped.skipped;

  if (!pool) {
    throw new Error('DATABASE_URL is not set');
  }

  for (let idx = 0; idx < effectiveSongs.length; idx += 1) {
    const row = effectiveSongs[idx]!;
    const current = idx + 1;

    if (seenExternal.has(row.external_id)) {
      skipped += 1;
      continue;
    }
    seenExternal.add(row.external_id);

    onProgress?.({ current, total, song_title: row.title, status: 'fetching' });

    let needsRetry = false;
    let lyricsText: string | null = null;
    let chordsText: string | null = null;

    // fetch lyrics
    const lyr = await fetchTelegraphTextDetailed(row.url_lyrics);
    if (lyr.ok) {
      lyricsText = lyr.text;
    } else {
      needsRetry = needsRetry || lyr.needsRetry;
      if (lyr.retryAfterMs) await sleep(lyr.retryAfterMs);
    }
    await sleep(requestDelayMs);

    // fetch chords
    const chr = await fetchTelegraphTextDetailed(row.url_chords);
    if (chr.ok) {
      chordsText = chr.text;
    } else {
      needsRetry = needsRetry || chr.needsRetry;
      if (chr.retryAfterMs) await sleep(chr.retryAfterMs);
    }
    await sleep(requestDelayMs);

    onProgress?.({ current, total, song_title: row.title, status: 'saving' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM songs WHERE external_id = $1 LIMIT 1',
        [row.external_id],
      );
      const content = (chordsText ?? lyricsText ?? '').trimEnd();
      const importedAt = nowIso();

      let songId: number;

      if (existing.rows[0]?.id) {
        songId = Number(existing.rows[0].id);
        await client.query(
          `UPDATE songs
           SET song_number = $2,
               title = $3,
               content = $4,
               table_of_contents = $5,
               url_lyrics = $6,
               url_chords = $7,
               url_youtube = $8,
               lyrics_text = $9,
               chords_text = $10,
               needs_retry = $11,
               imported_at = $12,
               updated_at = NOW()
           WHERE external_id = $1`,
          [
            row.external_id,
            row.song_number,
            row.title,
            content,
            row.table_of_contents,
            row.url_lyrics,
            row.url_chords,
            row.url_youtube,
            lyricsText,
            chordsText,
            needsRetry,
            importedAt,
          ],
        );
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO songs (
             external_id, song_number, title, slug, content,
             table_of_contents, url_lyrics, url_chords, url_youtube,
             lyrics_text, chords_text, needs_retry, imported_at,
             is_published, created_by_member_id
           )
           VALUES ($1,$2,$3,gen_random_uuid()::text,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13)
           RETURNING id`,
          [
            row.external_id,
            row.song_number,
            row.title,
            content,
            row.table_of_contents,
            row.url_lyrics,
            row.url_chords,
            row.url_youtube,
            lyricsText,
            chordsText,
            needsRetry,
            importedAt,
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

  return { success, failed, skipped, errors };
}

