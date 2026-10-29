/**
 * Generate verse timings (and optional TTS audio later) for Bible chapters.
 * Usage:
 *   npx ts-node --transpile-only src/cli/generateBibleAudio.ts --book=john --chapter=3
 *   npx ts-node --transpile-only src/cli/generateBibleAudio.ts --book=john --all-chapters
 */
import { loadEnvFromDotenv } from './loadEnv';

loadEnvFromDotenv();

import { findBookDefBySlug } from '../bible/bibleBookCatalog';
import { pool } from '../config/db';
import { generateChapterAudioMetadata } from '../services/bibleAudioService';

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const bookSlug = parseArg('book') ?? 'john';
  const chapterRaw = parseArg('chapter');
  const all = process.argv.includes('--all-chapters');
  const translation = parseArg('translation') ?? 'synodal';
  const def = findBookDefBySlug(bookSlug);
  if (!def) throw new Error(`Unknown book: ${bookSlug}`);

  const chapters = all
    ? Array.from({ length: def.chapters }, (_, i) => i + 1)
    : [Math.max(1, Number(chapterRaw) || 1)];

  for (const chapter of chapters) {
    const row = await generateChapterAudioMetadata({
      translationCode: translation,
      bookSlug,
      chapter,
    });
    console.log(
      `[bible-audio] ${bookSlug}:${chapter} voice=${row.voice_id} duration=${row.duration_sec}s timings=${row.timings.length}`,
    );
  }
}

main()
  .catch((e) => {
    console.error('[bible-audio] fatal', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined);
  });
