/**
 * Запуск инициализации БД вручную:
 * npx ts-node scripts/runInitDb.ts
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
