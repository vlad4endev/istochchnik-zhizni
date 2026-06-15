import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Без пакета dotenv: подхватывает .env, если DATABASE_URL ещё не задан. */
export function loadEnvFromDotenv(): void {
  if (process.env.DATABASE_URL?.trim()) return;
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
