/**
 * Массовая публикация всех готовых песен в общий каталог. В Docker:
 *   node dist/cli/repairAllCatalogSongs.js
 */
import { loadEnvFromDotenv } from './loadEnv';
import {
  countSongsHiddenFromPublicCatalog,
  syncAllSongsToPublicCatalog,
} from '../services/songService';

async function main(): Promise<void> {
  loadEnvFromDotenv();
  const before = await countSongsHiddenFromPublicCatalog();
  console.log(`[repairAllCatalog] Скрыто от общего каталога: ${before}`);
  if (before === 0) {
    console.log('[repairAllCatalog] Нечего исправлять.');
    return;
  }
  const result = await syncAllSongsToPublicCatalog();
  const after = await countSongsHiddenFromPublicCatalog();
  console.log(
    `[repairAllCatalog] Опубликовано: ${result.published}, синхронизирован текст: ${result.contentSynced}, осталось скрытых: ${after}`,
  );
}

main().catch((e) => {
  console.error('[repairAllCatalog]', e);
  process.exit(1);
});
