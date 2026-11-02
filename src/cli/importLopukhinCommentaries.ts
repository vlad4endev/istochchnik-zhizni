/**
 * Import Lopukhin commentaries from a JSON dump.
 * Format: [{ "book_slug":"john", "chapter":3, "verse_start":16, "verse_end":16, "title":"...", "body":"..." }]
 *
 * Usage: npx ts-node --transpile-only src/cli/importLopukhinCommentaries.ts path/to/dump.json
 */
import fs from 'fs';

import { loadEnvFromDotenv } from './loadEnv';

loadEnvFromDotenv();

import { pool } from '../config/db';
import { ensureSampleLopukhinCommentary, upsertLopukhinCommentary } from '../services/bibleCommentariesService';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    await ensureSampleLopukhinCommentary();
    console.log('[lopukhin] no file given — ensured sample commentary for John 3:16');
    return;
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  if (!Array.isArray(raw)) throw new Error('JSON root must be an array');

  let ok = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const bookSlug = typeof o.book_slug === 'string' ? o.book_slug : '';
    const chapter = Number(o.chapter);
    const body = typeof o.body === 'string' ? o.body : '';
    if (!bookSlug || !Number.isInteger(chapter) || !body.trim()) continue;
    await upsertLopukhinCommentary({
      translationCode: 'synodal',
      bookSlug,
      chapter,
      verseStart: o.verse_start != null ? Number(o.verse_start) : null,
      verseEnd: o.verse_end != null ? Number(o.verse_end) : null,
      title: typeof o.title === 'string' ? o.title : '',
      body,
    });
    ok += 1;
  }
  console.log(`[lopukhin] imported ${ok} commentaries`);
}

main()
  .catch((e) => {
    console.error('[lopukhin] fatal', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined);
  });
