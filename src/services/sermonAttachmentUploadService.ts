import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  buildUserMediaSermonAttachmentPath,
  getSupabaseStorageMissingEnv,
  isSupabaseStorageConfigured,
  uploadBufferToPublicBucket,
  userMediaBucket,
} from '../lib/supabaseStorage';

export type SermonAttachmentUploadResult = {
  id: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  uploaded_at: string;
};

/**
 * Multer/busboy нередко отдают UTF-8 имя как latin1-байты → «_ _ _.pptx» после sanitize.
 * Round-trip check как в messengerRoutes.decodeMultipartFilename.
 */
export function decodeMultipartFilename(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  try {
    const decoded = Buffer.from(s, 'latin1').toString('utf8');
    if (!decoded || decoded === s) return s;
    if (decoded.includes('\u0000')) return s;
    const back = Buffer.from(decoded, 'utf8').toString('latin1');
    if (back === s) return decoded;
  } catch {
    /* ignore */
  }
  return s;
}

function sanitizeOriginalFileName(raw: string): string {
  const base = path.basename(String(raw || 'presentation').trim() || 'presentation');
  // Буквы/цифры Unicode (кириллица и др.), пробел, точка, дефис, скобки.
  const cleaned = base
    .replace(/[^\p{L}\p{N} ._+\-()[\]]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  // Если после очистки остались только подчёркивания — имя было битым.
  const meaningful = cleaned.replace(/[_\s.]+/g, '');
  if (!meaningful) {
    const ext = path.extname(base).toLowerCase();
    return ext ? `presentation${ext}` : 'presentation';
  }
  return cleaned.slice(0, 180) || 'presentation';
}

function defaultMimeForExt(ext: string): string {
  switch (ext) {
    case '.ppt':
      return 'application/vnd.ms-powerpoint';
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case '.pdf':
      return 'application/pdf';
    case '.doc':
      return 'application/msword';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.odp':
      return 'application/vnd.oasis.opendocument.presentation';
    case '.key':
      return 'application/x-iwork-keynote-sffkey';
    default:
      return 'application/octet-stream';
  }
}

export async function storeSermonAttachmentFile(file: {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}): Promise<
  | { ok: true; attachment: SermonAttachmentUploadResult }
  | { ok: false; status: number; error: string; code?: string; missingEnv?: string[] }
> {
  const buf = file.buffer;
  if (!buf?.length) {
    return { ok: false, status: 400, error: 'Файл пуст' };
  }
  if (!isSupabaseStorageConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Хранилище файлов не настроено (нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY)',
      code: 'supabase_not_configured',
      missingEnv: getSupabaseStorageMissingEnv(),
    };
  }
  const originalName = decodeMultipartFilename(file.originalname) || String(file.originalname || '').trim();
  const ext = path.extname(originalName || '') || '';
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const mimeRaw = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const mimeType =
    mimeRaw && mimeRaw !== 'application/octet-stream' ? mimeRaw : defaultMimeForExt(safeExt);
  const name = sanitizeOriginalFileName(originalName || `presentation${safeExt}`);
  try {
    const objectPath = buildUserMediaSermonAttachmentPath(safeExt);
    const { publicUrl } = await uploadBufferToPublicBucket({
      bucket: userMediaBucket(),
      objectPath,
      file: buf,
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: { kind: 'sermon-attachment', original_name: name.slice(0, 120) },
    });
    return {
      ok: true,
      attachment: {
        id: randomUUID(),
        url: publicUrl,
        name,
        size: typeof file.size === 'number' && file.size > 0 ? file.size : buf.length,
        mime: mimeType,
        uploaded_at: new Date().toISOString(),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sermon-attachment] storage upload failed:', msg);
    return {
      ok: false,
      status: 502,
      error: 'Не удалось сохранить файл в хранилище',
      code: 'storage_upload',
    };
  }
}
