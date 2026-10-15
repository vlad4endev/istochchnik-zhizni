/**
 * CLI: дополняет каталог бекапа детальным снимком
 * (инвентарь БД, настройки, сервер, сводка чатов, Supabase Storage).
 *
 *   npx ts-node --transpile-only src/cli/enrichBackupSnapshot.ts backups/istochnik-backup-…
 *   npm run backup:enrich -- backups/latest
 */
import fs from 'node:fs';
import path from 'node:path';

import { enrichBackupDirectory } from '../services/backupDetailedSnapshot';

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg || arg === '-h' || arg === '--help') {
    console.log(
      'Usage: npx ts-node --transpile-only src/cli/enrichBackupSnapshot.ts <backup-dir>',
    );
    process.exit(arg ? 0 : 1);
  }

  const projectRoot = path.resolve(__dirname, '../..');
  let dir = path.isAbsolute(arg) ? arg : path.resolve(projectRoot, arg);
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) {
    dir = fs.realpathSync(dir);
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`Не найден каталог бекапа: ${dir}`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(dir, 'MANIFEST.txt'))) {
    console.error(`Нет MANIFEST.txt в ${dir}`);
    process.exit(1);
  }

  console.log(`[backup:enrich] ${dir}`);
  const components = await enrichBackupDirectory(dir, projectRoot);
  console.log(JSON.stringify(components, null, 2));
  console.log('[backup:enrich] OK');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
