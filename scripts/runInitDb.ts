/**
 * Запуск инициализации БД вручную (на машине с полным репозиторием):
 *   npm run db:init
 *
 * В прод-контейнере API (только dist — без scripts/src):
 *   docker compose exec api npm run db:init:docker
 *   (или, если есть файл после git pull: node dist/cli/runInitDb.js)
 */
import dotenv from 'dotenv';

dotenv.config();

async function main(): Promise<void> {
  const { initDb } = await import('../src/config/initDb');
  await initDb();
  console.log('Tables created successfully');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
