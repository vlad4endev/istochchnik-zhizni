/**
 * Seed Synodal Bible from Free.Bible JSON chapters.
 * Usage: npx ts-node --transpile-only src/cli/seedBibleSynodal.ts [--books=john,matthew] [--max-chapters=3]
 */
import { loadEnvFromDotenv } from './loadEnv';

loadEnvFromDotenv();

import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import { pool } from '../config/db';
import {
  ensureCatalogTranslations,
  ensureSynodalBooks,
  ensureSynodalTranslation,
  upsertChapterVerses,
  countVerses,
} from '../services/bibleCatalogService';
import { ensureSampleLopukhinCommentary } from '../services/bibleCommentariesService';

type ChapterJson = {
  verses?: Array<{ v: number; t: string }>;
};

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function fetchChapter(bookSlug: string, chapter: number): Promise<Array<{ v: number; t: string }>> {
  const url = `https://free.bible/bible/synodal/${bookSlug}/${chapter}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const json = (await res.json()) as ChapterJson;
  return (json.verses ?? [])
    .filter((v) => typeof v.v === 'number' && typeof v.t === 'string' && v.t.trim())
    .map((v) => ({ v: v.v, t: v.t.trim() }));
}

async function main(): Promise<void> {
  const booksFilter = parseArg('books');
  const maxChaptersRaw = parseArg('max-chapters');
  const maxChapters = maxChaptersRaw ? Math.max(1, Number(maxChaptersRaw) || 0) : null;
  const delayMs = Number(parseArg('delay-ms') ?? '40');

  const wanted = booksFilter
    ? new Set(
        booksFilter
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;

  await ensureCatalogTranslations();
  const translation = await ensureSynodalTranslation();
  const books = await ensureSynodalBooks(translation.id);

  const defs = BIBLE_BOOK_DEFS.filter((d) => !wanted || wanted.has(d.slug));
  console.log(`[bible-seed] translation=${translation.code} books=${defs.length}`);

  let chaptersOk = 0;
  let versesOk = 0;

  for (const def of defs) {
    const book = books.get(def.slug);
    if (!book) continue;
    const chapterLimit = maxChapters != null ? Math.min(def.chapters, maxChapters) : def.chapters;
    for (let ch = 1; ch <= chapterLimit; ch += 1) {
      try {
        const verses = await fetchChapter(def.slug, ch);
        await upsertChapterVerses(translation.id, book.id, ch, verses);
        chaptersOk += 1;
        versesOk += verses.length;
        if (chaptersOk % 25 === 0) {
          console.log(`[bible-seed] progress chapters=${chaptersOk} last=${def.slug}:${ch}`);
        }
      } catch (e) {
        console.warn(`[bible-seed] failed ${def.slug}:${ch}`, e);
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const total = await countVerses(translation.id);
  await ensureSampleLopukhinCommentary();
  console.log(`[bible-seed] done chapters=${chaptersOk} verses_upserted=${versesOk} total_in_db=${total}`);
}

main()
  .catch((e) => {
    console.error('[bible-seed] fatal', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool?.end().catch(() => undefined);
  });
