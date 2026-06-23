import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

import { getUploadsRoot } from '../config/uploadsRoot';

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  return 'jpg';
}

/** Сохраняет снимок партитуры и возвращает публичный URL `/uploads/...`. */
export function saveStudioSheetImage(buffer: Buffer, mimeType: string, memberId: number): string {
  const ext = extensionForMime(mimeType);
  const dir = path.join(getUploadsRoot(), 'studio-sheets', String(memberId));
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buffer);
  return `/uploads/studio-sheets/${memberId}/${name}`;
}
