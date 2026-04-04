import fs from 'node:fs';
import path from 'node:path';

/**
 * Корень пользовательских файлов (мессенджер, аватары).
 * Задайте UPLOADS_DIR в проде на путь с постоянным томом / bind-mount — иначе при пересборке
 * контейнера файлы пропадут, а ссылки в чате дадут 404.
 */
let cachedRoot: string | null = null;

export function getUploadsRoot(): string {
  if (cachedRoot) return cachedRoot;
  const raw = process.env.UPLOADS_DIR?.trim();
  cachedRoot =
    raw && raw.length > 0 ? path.resolve(raw) : path.join(process.cwd(), 'uploads');
  return cachedRoot;
}

export function getAvatarsDir(): string {
  return path.join(getUploadsRoot(), 'avatars');
}

export function ensureUploadsDirs(): void {
  const root = getUploadsRoot();
  try {
    fs.mkdirSync(path.join(root, 'avatars'), { recursive: true });
  } catch (e) {
    console.warn('[uploads] cannot create uploads directories:', root, e);
  }
}
