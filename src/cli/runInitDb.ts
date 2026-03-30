/**
 * CLI: применяет INIT_SQL / сиды (как при старте API).
 * Собирается в dist/cli/runInitDb.js — в Docker-образе API: `node dist/cli/runInitDb.js`
 * (в контейнере нет `scripts/*.ts` и исходников, только `dist/`).
 */
import { initDb } from '../config/initDb';

async function main(): Promise<void> {
  await initDb();
  // eslint-disable-next-line no-console
  console.log('[db] initDb finished OK');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
