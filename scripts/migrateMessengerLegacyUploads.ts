import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

import { query } from '../src/config/db';
import { getUploadsRoot } from '../src/config/uploadsRoot';
import {
  buildMessengerObjectPath,
  isSupabaseStorageConfigured,
  messengerBucket,
  uploadBufferToPublicBucket,
} from '../src/lib/supabaseStorage';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const BATCH_SIZE = Math.max(1, Number(process.env.MESSENGER_LEGACY_MIGRATION_BATCH ?? 100));

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function resolveLegacyLocalPath(rawUrl: string): string | null {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  let normalized = trimmed;
  if (normalized.startsWith('/api/messenger/public-uploads/')) {
    normalized = normalized.replace(/^\/api\/messenger\/public-uploads\//, '/uploads/');
  } else if (normalized.startsWith('/api/uploads/')) {
    normalized = normalized.replace(/^\/api\/uploads\//, '/uploads/');
  } else if (normalized.startsWith('api/uploads/')) {
    normalized = normalized.replace(/^api\/uploads\//, '/uploads/');
  }
  if (!normalized.startsWith('/uploads/')) return null;

  const rel = normalized.slice('/uploads/'.length);
  const safe = path.posix.normalize(rel).replace(/^\/+/, '');
  if (!safe || safe.startsWith('..') || safe.includes('\0')) return null;

  const root = path.resolve(getUploadsRoot());
  const abs = path.resolve(root, safe);
  const relToRoot = path.relative(root, abs);
  if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot) || relToRoot.includes('\0')) return null;
  return abs;
}

function resolveMimeFromPath(absPath: string, currentMime: unknown): string {
  const existing = String(currentMime ?? '').trim().toLowerCase();
  if (existing) return existing;
  const ext = path.extname(absPath).toLowerCase();
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

async function run(): Promise<void> {
  if (!isSupabaseStorageConfigured()) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }

  let lastId = '0';
  let scanned = 0;
  let readyToMigrate = 0;
  let migrated = 0;
  let missing = 0;
  let skipped = 0;

  for (;;) {
    const rows = await query(
      `SELECT id::text AS id, sender_id, payload
       FROM messages
       WHERE id > $1
         AND payload_type IN ('image', 'file')
         AND payload IS NOT NULL
         AND (
           payload->>'url' LIKE '/uploads/%'
           OR payload->>'url' LIKE '/api/uploads/%'
           OR payload->>'url' LIKE '/api/messenger/public-uploads/%'
         )
       ORDER BY id ASC
       LIMIT $2`,
      [lastId, BATCH_SIZE],
    );
    if (!rows.rows.length) break;

    for (const row of rows.rows as Array<{ id: string; sender_id: number | null; payload: Record<string, unknown> }>) {
      scanned += 1;
      lastId = row.id;
      const payload = row.payload ?? {};
      const rawUrl = String(payload.url ?? '').trim();
      const localAbs = resolveLegacyLocalPath(rawUrl);
      if (!localAbs) {
        skipped += 1;
        continue;
      }

      let buf: Buffer;
      try {
        buf = await fs.readFile(localAbs);
      } catch {
        missing += 1;
        continue;
      }

      const senderId = Number(row.sender_id);
      const memberId = Number.isFinite(senderId) && senderId > 0 ? senderId : 0;
      const ext = path.extname(localAbs).toLowerCase();
      const objectPath = buildMessengerObjectPath(memberId, ext);
      const mimeType = resolveMimeFromPath(localAbs, payload.mimeType);

      readyToMigrate += 1;
      if (!APPLY) {
        console.log('[migrate-uploads] dry-run message', row.id, 'local:', localAbs);
        continue;
      }

      const { publicUrl } = await uploadBufferToPublicBucket({
        bucket: messengerBucket(),
        objectPath,
        file: buf,
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: {
          migratedFrom: rawUrl.slice(0, 255),
          messageId: String(row.id),
        },
      });

      await query(
        `UPDATE messages
         SET payload = jsonb_set(payload, '{url}', to_jsonb($2::text), true),
             updated_at = NOW()
         WHERE id = $1`,
        [row.id, publicUrl],
      );
      migrated += 1;
      console.log('[migrate-uploads] migrated message', row.id, '->', publicUrl);
    }
  }

  console.log('[migrate-uploads] summary:', {
    mode: APPLY ? 'apply' : 'dry-run',
    scanned,
    readyToMigrate,
    migrated,
    missing,
    skipped,
  });
}

run().catch((err) => {
  console.error('[migrate-uploads] failed:', err);
  process.exit(1);
});
