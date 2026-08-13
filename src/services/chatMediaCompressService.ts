import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { query } from '../config/db';
import {
  buildMessengerChatObjectPath,
  deleteBucketObject,
  downloadBucketObject,
  isSupabaseStorageConfigured,
  messengerBucket,
  objectPathFromPublicStorageUrl,
  uploadBufferToPublicBucket,
} from '../lib/supabaseStorage';
import {
  classifyChatMediaForCompress,
  envInt,
  formatBytesShort,
  isWorthKeepingCompressed,
  normalizeObjectPath,
  type ChatCompressKind,
} from './chatMediaCompressHelpers';

export type ChatMediaCompressResult = {
  scanned: number;
  compressed: number;
  skipped: number;
  failed: number;
  bytesBefore: number;
  bytesAfter: number;
  dryRun: boolean;
  stoppedReason: 'done' | 'budget' | 'no_storage' | 'disabled';
};

type AttachmentSlot = {
  key: 'root' | number;
  url?: string;
  objectPath?: string;
  mimeType?: string;
  name?: string;
  size?: number;
  compressedAt?: string;
};

function isDryRun(): boolean {
  return process.env.CHAT_MEDIA_COMPRESS_DRY_RUN === 'true' || process.argv.includes('--dry-run');
}

async function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let errText = '';
    const timer = setTimeout(() => {
      try {
        ff.kill('SIGKILL');
      } catch {
        /* ignore */
      }
      reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    ff.stderr?.on('data', (d) => {
      errText += String(d);
      if (errText.length > 8000) errText = errText.slice(-4000);
    });
    ff.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(errText.trim() || `ffmpeg exit code ${String(code)}`));
    });
  });
}

async function compressWithFfmpeg(opts: {
  kind: Exclude<ChatCompressKind, 'skip'>;
  input: Buffer;
  inputExt: string;
}): Promise<{ buffer: Buffer; mimeType: string; extension: string } | null> {
  const token = randomUUID();
  const inPath = path.join(os.tmpdir(), `chat-compress-in-${token}${opts.inputExt || '.bin'}`);
  let outPath = '';
  let mimeType = '';
  let extension = '';
  const timeoutMs = envInt('CHAT_MEDIA_COMPRESS_FFMPEG_TIMEOUT_MS', 180_000, 10_000, 900_000);

  try {
    await fsp.writeFile(inPath, opts.input);

    if (opts.kind === 'image') {
      outPath = path.join(os.tmpdir(), `chat-compress-out-${token}.jpg`);
      mimeType = 'image/jpeg';
      extension = '.jpg';
      await runFfmpeg(
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inPath,
          '-vf',
          "scale='min(1920,iw)':'-2'",
          '-q:v',
          '5',
          outPath,
        ],
        timeoutMs,
      );
    } else if (opts.kind === 'audio') {
      outPath = path.join(os.tmpdir(), `chat-compress-out-${token}.ogg`);
      mimeType = 'audio/ogg';
      extension = '.ogg';
      await runFfmpeg(
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inPath,
          '-vn',
          '-c:a',
          'libopus',
          '-b:a',
          '48k',
          outPath,
        ],
        timeoutMs,
      );
    } else {
      outPath = path.join(os.tmpdir(), `chat-compress-out-${token}.mp4`);
      mimeType = 'video/mp4';
      extension = '.mp4';
      await runFfmpeg(
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inPath,
          '-vf',
          "scale='min(720,iw)':'-2'",
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          '64k',
          '-movflags',
          '+faststart',
          outPath,
        ],
        timeoutMs,
      );
    }

    const buffer = await fsp.readFile(outPath);
    if (!buffer.length) return null;
    return { buffer, mimeType, extension };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[chat-media-compress] ffmpeg failed:', msg);
    return null;
  } finally {
    await Promise.allSettled([
      fsp.unlink(inPath).catch(() => undefined),
      outPath ? fsp.unlink(outPath).catch(() => undefined) : Promise.resolve(),
    ]);
  }
}

function guessExt(mimeType: string | undefined, name: string | undefined, objectPath: string | undefined): string {
  const fromName = path.extname(String(name || '')).toLowerCase();
  if (fromName && fromName.length <= 12) return fromName;
  const fromPath = path.extname(String(objectPath || '')).toLowerCase();
  if (fromPath && fromPath.length <= 12) return fromPath;
  const mime = String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'audio/mpeg') return '.mp3';
  if (mime === 'audio/mp4' || mime === 'audio/aac' || mime === 'audio/x-m4a') return '.m4a';
  if (mime === 'audio/ogg' || mime === 'audio/opus') return '.ogg';
  if (mime === 'audio/webm') return '.webm';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  return '.bin';
}

function collectSlots(payloadType: string, payload: Record<string, unknown>): AttachmentSlot[] {
  const slots: AttachmentSlot[] = [];
  const images = Array.isArray(payload.images) ? payload.images : [];
  if (payloadType === 'image' && images.length > 0) {
    images.forEach((raw, idx) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      const im = raw as Record<string, unknown>;
      slots.push({
        key: idx,
        url: String(im.url ?? '').trim() || undefined,
        objectPath: normalizeObjectPath(im.objectPath ?? im.object_path),
        mimeType: String(im.mimeType ?? im.mimetype ?? '').trim() || undefined,
        name: String(im.name ?? im.filename ?? '').trim() || undefined,
        size: Number(im.size ?? 0) || undefined,
        compressedAt: String(im.compressedAt ?? '').trim() || undefined,
      });
    });
    return slots;
  }

  slots.push({
    key: 'root',
    url: String(payload.url ?? '').trim() || undefined,
    objectPath: normalizeObjectPath(payload.objectPath ?? payload.object_path),
    mimeType: String(payload.mimeType ?? payload.mimetype ?? '').trim() || undefined,
    name: String(payload.name ?? payload.filename ?? '').trim() || undefined,
    size: Number(payload.size ?? 0) || undefined,
    compressedAt: String(payload.compressedAt ?? '').trim() || undefined,
  });
  return slots;
}

function resolveObjectPath(slot: AttachmentSlot, bucket: string): string | undefined {
  if (slot.objectPath) return slot.objectPath;
  if (slot.url) return objectPathFromPublicStorageUrl(slot.url, bucket);
  return undefined;
}

async function compressOneSlot(opts: {
  conversationId: string;
  payloadType: string;
  slot: AttachmentSlot;
  minBytes: number;
  maxProcessBytes: number;
  dryRun: boolean;
}): Promise<{
  status: 'compressed' | 'skipped' | 'failed';
  bytesBefore: number;
  bytesAfter: number;
  next?: AttachmentSlot;
  oldObjectPath?: string;
}> {
  const bucket = messengerBucket();
  if (opts.slot.compressedAt) {
    return { status: 'skipped', bytesBefore: 0, bytesAfter: 0 };
  }

  const kind = classifyChatMediaForCompress({
    payloadType: opts.payloadType,
    mimeType: opts.slot.mimeType,
    fileName: opts.slot.name,
  });
  if (kind === 'skip') {
    return { status: 'skipped', bytesBefore: 0, bytesAfter: 0 };
  }

  const objectPath = resolveObjectPath(opts.slot, bucket);
  if (!objectPath) {
    return { status: 'skipped', bytesBefore: 0, bytesAfter: 0 };
  }

  let buffer: Buffer;
  let contentType: string | null = null;
  try {
    const downloaded = await downloadBucketObject({ bucket, objectPath });
    buffer = downloaded.buffer;
    contentType = downloaded.contentType;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[chat-media-compress] download failed ${objectPath}:`, msg);
    return { status: 'failed', bytesBefore: 0, bytesAfter: 0 };
  }

  const before = buffer.length;
  if (before < opts.minBytes) {
    return { status: 'skipped', bytesBefore: before, bytesAfter: before };
  }
  if (before > opts.maxProcessBytes) {
    return { status: 'skipped', bytesBefore: before, bytesAfter: before };
  }

  const mime = contentType || opts.slot.mimeType;
  const inputExt = guessExt(mime, opts.slot.name, objectPath);
  const compressed = await compressWithFfmpeg({ kind, input: buffer, inputExt });
  if (!compressed || !isWorthKeepingCompressed(before, compressed.buffer.length)) {
    return { status: 'skipped', bytesBefore: before, bytesAfter: before };
  }

  if (opts.dryRun) {
    return {
      status: 'compressed',
      bytesBefore: before,
      bytesAfter: compressed.buffer.length,
      oldObjectPath: objectPath,
    };
  }

  const newPath = buildMessengerChatObjectPath(opts.conversationId, compressed.extension);
  try {
    const { publicUrl } = await uploadBufferToPublicBucket({
      bucket,
      objectPath: newPath,
      file: compressed.buffer,
      contentType: compressed.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      upsert: true,
    });
    const baseName = String(opts.slot.name || path.basename(objectPath) || 'file').replace(/\.[^.]+$/, '');
    const nextName = `${baseName || 'file'}${compressed.extension}`;
    return {
      status: 'compressed',
      bytesBefore: before,
      bytesAfter: compressed.buffer.length,
      oldObjectPath: objectPath,
      next: {
        ...opts.slot,
        url: publicUrl,
        objectPath: newPath,
        mimeType: compressed.mimeType,
        name: nextName,
        size: compressed.buffer.length,
        compressedAt: new Date().toISOString(),
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[chat-media-compress] upload failed ${newPath}:`, msg);
    return { status: 'failed', bytesBefore: before, bytesAfter: before };
  }
}

function applySlotToPayload(
  payload: Record<string, unknown>,
  payloadType: string,
  slot: AttachmentSlot,
  next: AttachmentSlot,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  if (payloadType === 'image' && Array.isArray(out.images) && typeof slot.key === 'number') {
    const images = [...out.images];
    const prev =
      images[slot.key] && typeof images[slot.key] === 'object' && !Array.isArray(images[slot.key])
        ? { ...(images[slot.key] as Record<string, unknown>) }
        : {};
    images[slot.key] = {
      ...prev,
      url: next.url,
      objectPath: next.objectPath,
      mimeType: next.mimeType,
      name: next.name,
      size: next.size,
      compressedAt: next.compressedAt,
    };
    out.images = images;
    const first = images[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const f = first as Record<string, unknown>;
      out.url = f.url;
      out.objectPath = f.objectPath;
      out.mimeType = f.mimeType;
      out.name = f.name;
      out.size = f.size;
    }
    return out;
  }

  out.url = next.url;
  out.objectPath = next.objectPath;
  out.mimeType = next.mimeType;
  out.name = next.name;
  out.size = next.size;
  out.compressedAt = next.compressedAt;
  return out;
}

/**
 * Пакетное сжатие медиа вложений чатов в Supabase Storage.
 * Обрабатывает сообщения старше N дней, ещё не помеченные `payload.compressedAt`.
 */
export async function runChatMediaCompress(opts?: {
  maxMessages?: number;
  timeBudgetMs?: number;
}): Promise<ChatMediaCompressResult> {
  const dryRun = isDryRun();
  const result: ChatMediaCompressResult = {
    scanned: 0,
    compressed: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    dryRun,
    stoppedReason: 'done',
  };

  if (process.env.DISABLE_CHAT_MEDIA_COMPRESS_CRON === 'true' && !process.argv.includes('--force')) {
    result.stoppedReason = 'disabled';
    return result;
  }

  if (!isSupabaseStorageConfigured()) {
    result.stoppedReason = 'no_storage';
    return result;
  }

  const minAgeDays = envInt('CHAT_MEDIA_MIN_AGE_DAYS', 30, 1, 3650);
  const minBytes = envInt('CHAT_MEDIA_MIN_BYTES', 200_000, 10_000, 50_000_000);
  const maxProcessBytes = envInt('CHAT_MEDIA_MAX_PROCESS_BYTES', 80 * 1024 * 1024, 1_000_000, 500_000_000);
  const batchSize = envInt('CHAT_MEDIA_COMPRESS_BATCH_SIZE', 40, 1, 200);
  const maxMessages = opts?.maxMessages ?? envInt('CHAT_MEDIA_COMPRESS_MAX_MESSAGES', 500, 1, 20_000);
  const timeBudgetMs =
    opts?.timeBudgetMs ?? envInt('CHAT_MEDIA_COMPRESS_TIME_BUDGET_MS', 45 * 60_000, 30_000, 6 * 60 * 60_000);
  const startedAt = Date.now();
  const bucket = messengerBucket();

  let lastId = '0';
  let processedMessages = 0;

  while (processedMessages < maxMessages) {
    if (Date.now() - startedAt > timeBudgetMs) {
      result.stoppedReason = 'budget';
      break;
    }

    const limit = Math.min(batchSize, maxMessages - processedMessages);
    const rows = await query(
      `SELECT id::text AS id,
              conversation_id::text AS conversation_id,
              payload_type::text AS payload_type,
              payload
       FROM messages
       WHERE id > $1
         AND COALESCE(is_deleted, FALSE) = FALSE
         AND payload_type IN ('image', 'audio', 'file', 'video_note')
         AND created_at < NOW() - ($2::int * INTERVAL '1 day')
         AND payload->>'compressedAt' IS NULL
       ORDER BY id ASC
       LIMIT $3`,
      [lastId, minAgeDays, limit],
    );

    if (!rows.rows.length) {
      result.stoppedReason = 'done';
      break;
    }

    for (const row of rows.rows as Array<{
      id: string;
      conversation_id: string;
      payload_type: string;
      payload: unknown;
    }>) {
      if (Date.now() - startedAt > timeBudgetMs) {
        result.stoppedReason = 'budget';
        break;
      }

      lastId = row.id;
      processedMessages += 1;
      result.scanned += 1;

      const payloadType = String(row.payload_type || '').trim();
      const payload =
        row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
          ? ({ ...(row.payload as Record<string, unknown>) } as Record<string, unknown>)
          : {};

      const slots = collectSlots(payloadType, payload);
      let nextPayload = payload;
      let messageChanged = false;
      let hadFailure = false;
      const oldPathsToDelete: string[] = [];

      for (const slot of slots) {
        const one = await compressOneSlot({
          conversationId: row.conversation_id,
          payloadType,
          slot,
          minBytes,
          maxProcessBytes,
          dryRun,
        });

        if (one.status === 'skipped') {
          result.skipped += 1;
          continue;
        }
        if (one.status === 'failed') {
          result.failed += 1;
          hadFailure = true;
          continue;
        }

        result.compressed += 1;
        result.bytesBefore += one.bytesBefore;
        result.bytesAfter += one.bytesAfter;

        if (!dryRun && one.next) {
          nextPayload = applySlotToPayload(nextPayload, payloadType, slot, one.next);
          messageChanged = true;
          if (one.oldObjectPath && one.oldObjectPath !== one.next.objectPath) {
            oldPathsToDelete.push(one.oldObjectPath);
          }
        }
      }

      // Помечаем сообщение, чтобы не сканировать каждый месяц.
      // При ошибках флаг не ставим — повторим; уже сжатые слоты имеют свой compressedAt.
      if (!dryRun && !hadFailure) {
        nextPayload = { ...nextPayload, compressedAt: new Date().toISOString() };
        messageChanged = true;
      }

      if (!dryRun && messageChanged) {
        try {
          await query(`UPDATE messages SET payload = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
            row.id,
            JSON.stringify(nextPayload),
          ]);
          for (const oldPath of oldPathsToDelete) {
            try {
              await deleteBucketObject({ bucket, objectPath: oldPath });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              console.warn(`[chat-media-compress] delete old object failed ${oldPath}:`, msg);
            }
          }
        } catch (e) {
          result.failed += 1;
          result.compressed = Math.max(0, result.compressed - 1);
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[chat-media-compress] update message ${row.id} failed:`, msg);
        }
      }
    }
  }

  return result;
}

export function summarizeChatMediaCompress(result: ChatMediaCompressResult): string {
  const saved = Math.max(0, result.bytesBefore - result.bytesAfter);
  return [
    `scanned=${result.scanned}`,
    `compressed=${result.compressed}`,
    `skipped=${result.skipped}`,
    `failed=${result.failed}`,
    `saved=${formatBytesShort(saved)}`,
    `dryRun=${result.dryRun}`,
    `stop=${result.stoppedReason}`,
  ].join(', ');
}
