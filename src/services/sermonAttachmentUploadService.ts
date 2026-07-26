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

function sanitizeOriginalFileName(raw: string): string {
  const base = path.basename(String(raw || 'presentation').trim() || 'presentation');
  const cleaned = base.replace(/[^\w.\u0400-\u04FF ()+\-[\]]+/g, '_').replace(/\s+/g, ' ').trim();
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
  const ext = path.extname(file.originalname || '') || '';
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const mimeRaw = String(file.mimetype || '').toLowerCase().split(';')[0].trim();
  const mimeType =
    mimeRaw && mimeRaw !== 'application/octet-stream' ? mimeRaw : defaultMimeForExt(safeExt);
  const name = sanitizeOriginalFileName(file.originalname || `presentation${safeExt}`);
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
