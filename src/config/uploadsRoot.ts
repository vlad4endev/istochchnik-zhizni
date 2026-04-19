import fs from 'node:fs';
import path from 'node:path';

/**
 * Корень **устаревших** локальных файлов (только отдача через `express.static`, если ещё есть на диске).
 * Новые аватары, медиа профиля, афиши и вложения чата пишутся в **Supabase Storage**, не сюда.
 * `UPLOADS_DIR` — том для старых `/uploads/...` ссылок до миграции.
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

export function getEventPostersDir(): string {
  return path.join(getUploadsRoot(), 'event-posters');
}

export function getProfileMediaDir(): string {
  return path.join(getUploadsRoot(), 'profile-media');
}

export function ensureUploadsDirs(): void {
  const root = getUploadsRoot();
  try {
    fs.mkdirSync(path.join(root, 'avatars'), { recursive: true });
    fs.mkdirSync(path.join(root, 'event-posters'), { recursive: true });
    fs.mkdirSync(path.join(root, 'profile-media'), { recursive: true });
  } catch (e) {
    console.warn('[uploads] cannot create uploads directories:', root, e);
  }
}
