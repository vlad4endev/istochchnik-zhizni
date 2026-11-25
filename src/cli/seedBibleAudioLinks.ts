/**
 * Заполняет bible_audio_chapters ссылками на MP3 озвучку глав (без скачивания файлов).
 *
 * Источник по умолчанию — WordProject (wordproaudio.net), русская аудио-Библия:
 *   https://www.wordproaudio.net/bibles/app/audio/{langId}/{bookOrd}/{chapter}.mp3
 * langId=8 — русский язык, bookOrd — протестантский канон 1..66 (совпадает с bible_books.ord).
 *
 * Usage:
 *   npx ts-node --transpile-only src/cli/seedBibleAudioLinks.ts
 *   npx ts-node --transpile-only src/cli/seedBibleAudioLinks.ts --translation=synodal --lang=8
 *   npx ts-node --transpile-only src/cli/seedBibleAudioLinks.ts --books=matthew,john --max-chapters=2 --dry-run
 */
import { loadEnvFromDotenv } from './loadEnv';

loadEnvFromDotenv();

import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import { pool } from '../config/db';
import { upsertChapterAudio } from '../services/bibleAudioService';

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const translation = parseArg('translation') ?? 'synodal';
  const langId = parseArg('lang') ?? '8';
  const booksFilter = (parseArg('books') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const maxChapters = Number(parseArg('max-chapters')) || 0;
  const dryRun = process.argv.includes('--dry-run');
  const urlTemplate =
    parseArg('url-template') ??
    `https://www.wordproaudio.net/bibles/app/audio/${langId}/{ord}/{chapter}.mp3`;

  const books = BIBLE_BOOK_DEFS.filter(
    (d) => booksFilter.length === 0 || booksFilter.includes(d.slug),
  );
  if (books.length === 0) throw new Error(`No books matched: ${booksFilter.join(',')}`);

  let total = 0;
  for (const def of books) {
    const chapters = maxChapters > 0 ? Math.min(def.chapters, maxChapters) : def.chapters;
    for (let chapter = 1; chapter <= chapters; chapter += 1) {
      const audioUrl = urlTemplate
        .replace('{ord}', String(def.ord))
        .replace('{chapter}', String(chapter));
      if (dryRun) {
        if (total < 5) console.log(`[dry-run] ${def.slug}:${chapter} -> ${audioUrl}`);
      } else {
        await upsertChapterAudio({
          translationCode: translation,
          bookSlug: def.slug,
          chapter,
          audioUrl,
          timings: [],
          voiceId: 'default',
          durationSec: 0,
        });
      }
      total += 1;
    }
    if (!dryRun) console.log(`[bible-audio-links] ${def.slug}: ${chapters} глав`);
  }

  console.log(
    `[bible-audio-links] ${dryRun ? 'проверено' : 'записано'} ${total} глав (${translation}, lang=${langId})`,
  );
}

main()
  .catch((e) => {
    console.error('[bible-audio-links] fatal', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined);
  });
