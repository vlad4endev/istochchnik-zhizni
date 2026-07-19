import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { resolveMessengerConversationDeepLink } from '../config/messengerPublic';
import { getUploadsRoot } from '../config/uploadsRoot';
import { requireAuthSession } from '../middleware/authSession';
import { blockImpersonationForChats } from '../middleware/blockImpersonationForChats';
import { attachConversationFromMessageIdParam, checkChatPermission } from '../middleware/chatPermission';
import { ensureValidRequest, validateSendMessage } from '../middleware/messengerValidation';
import { messengerUpload } from '../middleware/upload';
import * as svc from '../services/messengerService';
import {
  ensureAssistantConversation,
  replyAsAssistantBot,
} from '../services/messengerAssistantService';
import { sendToRoomAll, sendToRoom, sendToMember, ensureMemberInRoom, isMemberOnline } from '../realtime/wsHub';
import { sendPushNotification } from '../services/pushService';
import {
  buildMessengerChatObjectPath,
  buildMessengerObjectPath,
  createSignedUrlForBucketObject,
  downloadBucketObject,
  getSupabaseStorageMissingEnv,
  isStorageBucketHealthCheckInconclusive,
  isSupabaseStorageConfigured,
  messengerBucket,
  verifyStorageBucketPresent,
  rewriteSupabaseStorageUrlForClient,
  uploadBufferToPublicBucket,
  uploadStreamToPublicBucket,
} from '../lib/supabaseStorage';
import type { AppRole } from '../types/appRole';
import { canAccessMessengerAssistant } from '../types/appRole';

type AuthReq = Request & {
  authUserId?: number;
  authUserRole?: AppRole;
  authUserRoles?: AppRole[];
};

function sessionRoles(req: Request): AppRole[] {
  const r = req as AuthReq;
  if (Array.isArray(r.authUserRoles) && r.authUserRoles.length > 0) {
    return r.authUserRoles;
  }
  if (r.authUserRole) return [r.authUserRole];
  return [];
}

const MESSENGER_ATTACHMENT_PROXY_MAX_BYTES = 25 * 1024 * 1024;

function messengerAttachmentContentDisposition(download: boolean, rawName: string): string {
  const kind = download ? 'attachment' : 'inline';
  const base = (rawName.trim() || 'file').slice(0, 220);
  const ascii = base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\\r\n]/g, '_').slice(0, 160);
  const star = encodeURIComponent(base);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${star}`;
}

function withMp4Extension(fileName: string): string {
  const base = String(fileName || '').trim();
  if (!base) return 'video-note.mp4';
  const idx = base.lastIndexOf('.');
  if (idx <= 0) return `${base}.mp4`;
  return `${base.slice(0, idx)}.mp4`;
}

async function transcodeWebmBufferToMp4(input: Buffer): Promise<Buffer | null> {
  const token = randomUUID();
  const inPath = path.join(os.tmpdir(), `messenger-vn-${token}.webm`);
  const outPath = path.join(os.tmpdir(), `messenger-vn-${token}.mp4`);
  try {
    await fsp.writeFile(inPath, input);
    await new Promise<void>((resolve, reject) => {
      const ff = spawn(
        'ffmpeg',
        [
          '-y',
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          inPath,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          outPath,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let errText = '';
      ff.stderr?.on('data', (d) => {
        errText += String(d);
      });
      ff.on('error', (e) => reject(e));
      ff.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(errText.trim() || `ffmpeg exit code ${String(code)}`));
      });
    });
    return await fsp.readFile(outPath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[messenger] webm->mp4 transcode skipped:', msg);
    return null;
  } finally {
    await Promise.allSettled([fsp.unlink(inPath), fsp.unlink(outPath)]);
  }
}

async function loadMessengerAttachmentBytesForProxy(
  item: NonNullable<Awaited<ReturnType<typeof svc.getMessageAttachmentForMember>>>,
): Promise<{ buffer: Buffer; contentType: string }> {
  const bucket = messengerBucket();
  if (item.objectPath && isSupabaseStorageConfigured()) {
    const { buffer, contentType } = await downloadBucketObject({
      bucket,
      objectPath: item.objectPath,
    });
    if (buffer.length > MESSENGER_ATTACHMENT_PROXY_MAX_BYTES) {
      throw new Error('Attachment too large');
    }
    return {
      buffer,
      contentType: (contentType && contentType.trim()) || item.mimeType || 'application/octet-stream',
    };
  }
  if (item.url) {
    const u = item.url.trim();
    if (u.startsWith('/uploads/') || u.startsWith('/api/uploads/')) {
      const rel = u.replace(/^\/api\/uploads\//, '/uploads/');
      const stripped = rel.replace(/^\/uploads\//, '').replace(/\\/g, '/');
      if (!stripped || stripped.includes('..')) {
        throw new Error('Invalid attachment path');
      }
      const root = path.resolve(getUploadsRoot());
      const full = path.resolve(path.join(root, stripped));
      if (!full.startsWith(root)) {
        throw new Error('Invalid attachment path');
      }
      const buffer = await fsp.readFile(full);
      if (buffer.length > MESSENGER_ATTACHMENT_PROXY_MAX_BYTES) {
        throw new Error('Attachment too large');
      }
      return {
        buffer,
        contentType: item.mimeType || 'application/octet-stream',
      };
    }
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 25_000);
    try {
      const res = await fetch(u, { redirect: 'follow', signal: ac.signal });
      if (!res.ok) {
        throw new Error(`Remote attachment HTTP ${res.status}`);
      }
      const len = res.headers.get('content-length');
      if (len && Number(len) > MESSENGER_ATTACHMENT_PROXY_MAX_BYTES) {
        throw new Error('Attachment too large');
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MESSENGER_ATTACHMENT_PROXY_MAX_BYTES) {
        throw new Error('Attachment too large');
      }
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim();
      return {
        buffer,
        contentType: ct || item.mimeType || 'application/octet-stream',
      };
    } finally {
      clearTimeout(to);
    }
  }
  throw new Error('Attachment source missing');
}

/** Вложения грузятся в публичный объект Storage — постоянный URL уже достаточен, подпись не нужна и даёт лишние ошибки, если объект в БД и в бакете разошлись. */
function isMessengerPublicObjectUrl(url: string, bucket: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return u.pathname.includes(`/storage/v1/object/public/${bucket}/`);
  } catch {
    return false;
  }
}

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
  '.mp4': 'video/mp4',
  '.m4v': 'video/x-m4v',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.caf': 'audio/x-caf',
};
const MIME_TO_EXT: Record<string, string> = {
  ...Object.entries(EXT_TO_MIME).reduce<Record<string, string>>((acc, [ext, mime]) => {
    if (!acc[mime]) acc[mime] = ext;
    return acc;
  }, {}),
  'video/webm': '.webm',
};

const MESSENGER_MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MESSENGER_MAX_NON_VIDEO_BYTES = 20 * 1024 * 1024;

function inferMimeFromHeader(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (buf.length >= 6) {
    const sig6 = buf.subarray(0, 6).toString('ascii');
    if (sig6 === 'GIF87a' || sig6 === 'GIF89a') return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'video/webm';
  }
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf
      .subarray(8, 12)
      .toString('ascii')
      .replace(/\0/g, '')
      .trim()
      .toLowerCase();
    if (brand.startsWith('heic')) return 'image/heic';
    if (brand.startsWith('heif')) return 'image/heif';
    if (brand === 'mif1' || brand === 'msf1') return 'image/heif';
    if (brand === 'avif') return 'image/avif';
    if (
      brand === 'isom' ||
      brand === 'iso2' ||
      brand.startsWith('mp4') ||
      brand === 'dash' ||
      brand === 'msnv' ||
      brand === 'avc1' ||
      brand === '3gp4' ||
      brand === '3gp5' ||
      brand === '3g2a'
    ) {
      return 'video/mp4';
    }
    if (brand === 'qt' || brand.startsWith('qt')) return 'video/quicktime';
    if (brand.includes('m4v')) return 'video/x-m4v';
  }
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return 'application/pdf';
  }
  return null;
}

function normalizeExtension(input: string): string {
  const cleaned = String(input || '').trim().toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (!cleaned || cleaned === '.') return '';
  return cleaned.startsWith('.') ? cleaned : `.${cleaned}`;
}

/**
 * Multer/busboy нередко отдают имя файла в UTF-8 как последовательность байт в latin1.
 * Проверка round-trip: только тогда подменяем, чтобы не портить уже корректные Unicode-строки.
 */
function decodeMultipartFilename(raw: unknown): string {
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

async function resolveMessengerUploadMetadata(file: Express.Multer.File): Promise<{ mimeType: string; extension: string }> {
  const filename = decodeMultipartFilename(file.originalname);
  const extMatch = filename.match(/(\.[a-z0-9]{1,12})$/i);
  const byName = normalizeExtension(extMatch?.[1] || '');
  const byMime = String(file.mimetype || '').trim().toLowerCase();
  let sniffed = '';
  if (file.path) {
    const fh = await fsp.open(file.path, 'r');
    try {
      const buf = Buffer.alloc(16384);
      const { bytesRead } = await fh.read(buf, 0, 16384, 0);
      sniffed = inferMimeFromHeader(buf.subarray(0, bytesRead)) ?? '';
    } finally {
      await fh.close();
    }
  } else if (file.buffer && file.buffer.length > 0) {
    sniffed = inferMimeFromHeader(file.buffer) ?? '';
  }
  const mimeType = sniffed || byMime || EXT_TO_MIME[byName] || 'application/octet-stream';
  const extension = normalizeExtension(byName || MIME_TO_EXT[mimeType] || MIME_TO_EXT[sniffed] || '');
  return { mimeType, extension };
}

function attachmentSignedUrlTtlSec(): number {
  const n = Number(process.env.MESSENGER_ATTACHMENT_SIGNED_URL_TTL_SEC ?? 3600);
  if (!Number.isFinite(n)) return 3600;
  return Math.min(7 * 24 * 3600, Math.max(60, Math.floor(n)));
}

/** DB `messages.id` / FK columns are bigint; drop temp-ids and other junk so Postgres never 500s on cast. */
function normalizeOptionalBigintId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  return s;
}

const router = Router();

router.use(blockImpersonationForChats);

/** Multer без обёртки отдаёт 500 при LIMIT_* / fileFilter — отвечаем JSON 400 как в authRoutes. */
function messengerUploadMiddleware(req: Request, res: Response, next: NextFunction): void {
  messengerUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'File too large', maxBytes: MESSENGER_MAX_VIDEO_BYTES });
        return;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'File type not allowed' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Upload failed';
    res.status(400).json({ error: message });
  });
}

async function getConversationListItemForMember(memberId: number, convId: string) {
  return svc.getConversationListItem(memberId, String(convId));
}

async function getMemberDisplayName(memberId: number): Promise<string> {
  try {
    const { query: dbQuery } = await import('../config/db');
    const r = await dbQuery(
      `SELECT name, first_name, last_name FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = r.rows[0] as { name?: string; first_name?: string; last_name?: string } | undefined;
    const full = `${String(row?.first_name ?? '').trim()} ${String(row?.last_name ?? '').trim()}`.trim();
    return full || String(row?.name ?? '').trim() || 'Участник';
  } catch {
    return 'Участник';
  }
}

/** GET /api/messenger/uploads/health — всегда HTTP 200, чтобы axios/fetch не падали; смотрите поле `ok`. */
router.get('/uploads/health', async (_req: Request, res: Response) => {
  if (!isSupabaseStorageConfigured()) {
    res.status(200).json({
      ok: false,
      storage: 'unavailable',
      reason: 'supabase_not_configured',
      missingEnv: getSupabaseStorageMissingEnv(),
    });
    return;
  }
  const bucket = messengerBucket();
  const v = await verifyStorageBucketPresent(bucket);
  if (!v.ok && isStorageBucketHealthCheckInconclusive(v)) {
    console.warn('[messenger] uploads/health: проверка бакета по listBuckets недоступна (часто self-hosted):', v.reason, v.message ?? '');
    res.status(200).json({
      ok: true,
      storage: 'supabase',
      bucket,
      bucketCheck: { inconclusive: true, reason: v.reason, message: v.message },
    });
    return;
  }
  if (!v.ok) {
    const base = {
      ok: false,
      storage: 'unavailable' as const,
      bucket,
      existingBuckets: v.existingBucketIds,
    };
    if (v.reason === 'bucket_not_found') {
      res.status(200).json({
        ...base,
        reason: 'storage_bucket_not_found',
        hint:
          'В Supabase нет бакета с таким id. Выполните SQL: scripts/ensure-supabase-storage-buckets.sql (Dashboard → SQL), либо supabase db push. Либо создайте бакет в Storage вручную. Имя задаётся SUPABASE_STORAGE_BUCKET_MESSENGER (по умолчанию chat).',
      });
      return;
    }
    res.status(200).json({
      ...base,
      reason: v.reason,
      message: v.message,
      missingEnv: v.reason === 'not_configured' ? getSupabaseStorageMissingEnv() : undefined,
    });
    return;
  }
  res.status(200).json({ ok: true, storage: 'supabase', bucket });
});

// All messenger routes require authentication
router.use(requireAuthSession);

/** POST /api/messenger/studio/song-chat { songId } — чат обсуждения песни (студия). */
router.post('/studio/song-chat', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const songId = Number((req.body as { songId?: unknown })?.songId);
  if (!Number.isFinite(songId) || songId <= 0) {
    res.status(400).json({ error: 'songId is required' });
    return;
  }
  try {
    const { conversationId } = await svc.findOrCreateStudioSongConversation(songId, userId);
    ensureMemberInRoom(userId, conversationId);
    res.json({
      conversationId,
      openUrl: resolveMessengerConversationDeepLink(conversationId),
    });
  } catch (e) {
    console.error('[messenger] studio song-chat error:', e);
    res.status(500).json({ error: 'Failed to open song chat' });
  }
});

/** POST /api/messenger/assistant — личный чат с «ИИ помощник». */
router.post('/assistant', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  if (!canAccessMessengerAssistant(sessionRoles(req))) {
    res.status(403).json({
      error: 'ИИ помощник доступен только членам церкви. Для прихожан чат недоступен.',
    });
    return;
  }
  try {
    const { conversationId, created } = await ensureAssistantConversation(userId);
    ensureMemberInRoom(userId, conversationId);
    const conversation = await getConversationListItemForMember(userId, conversationId);
    if (created && conversation) {
      sendToMember(userId, { type: 'conv:created', conversation });
    }
    res.json({
      conversationId,
      created,
      conversation: conversation ?? null,
      openUrl: resolveMessengerConversationDeepLink(conversationId),
    });
  } catch (e) {
    console.error('[messenger] ensure assistant error:', e);
    res.status(500).json({ error: 'Failed to open assistant chat' });
  }
});

/** POST /api/messenger/upload (form-data: file) -> { url, name, size } */
router.post('/upload', messengerUploadMiddleware, async (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const tempPath = file?.path;
  try {
    if (!file) {
      res.status(400).json({ error: 'File is required' });
      return;
    }
    if (!tempPath || !file.size) {
      res.status(400).json({ error: 'File is empty' });
      return;
    }
    if (!isSupabaseStorageConfigured()) {
      const missingEnv = getSupabaseStorageMissingEnv();
      console.error('[messenger] storage is not configured:', { missingEnv });
      res.status(503).json({
        error: 'Storage is not configured',
        code: 'supabase_not_configured',
        missingEnv,
      });
      return;
    }
    const memberId = (req as AuthReq).authUserId!;
    const displayName = decodeMultipartFilename(file.originalname).slice(0, 255) || 'file';
    const { mimeType, extension } = await resolveMessengerUploadMetadata(file);
    const contentType =
      String(mimeType || '').trim() || String(file.mimetype || '').trim() || 'application/octet-stream';
    const isVideo = contentType.startsWith('video/');
    const maxAllowed = isVideo ? MESSENGER_MAX_VIDEO_BYTES : MESSENGER_MAX_NON_VIDEO_BYTES;
    if (file.size > maxAllowed) {
      res.status(413).json({
        error: isVideo ? 'Видео не больше 1GB' : 'Файл слишком большой (максимум 20MB)',
        maxBytes: maxAllowed,
      });
      return;
    }
    const bucket = messengerBucket();
    const rawConvId = String((req.body as { conversationId?: unknown })?.conversationId ?? '').trim();
    const isDraftConv = rawConvId.toLowerCase().startsWith('draft:');
    let objectPath: string;
    if (rawConvId && !isDraftConv) {
      const allowed = await svc.isMemberInConversation(rawConvId, memberId);
      if (!allowed) {
        res.status(403).json({ error: 'Нет доступа к этому чату для загрузки файла' });
        return;
      }
      const uploadMeta = await svc.getConversationMeta(rawConvId);
      if (uploadMeta && svc.isMessengerAccessRequestsChannelMetadata(uploadMeta.metadata)) {
        res.status(403).json({ error: 'В этом канале нельзя прикреплять файлы' });
        return;
      }
      objectPath = buildMessengerChatObjectPath(rawConvId, extension);
    } else {
      objectPath = buildMessengerObjectPath(memberId, extension);
    }
    let url: string | null = null;
    try {
      if (isVideo) {
        const { publicUrl } = await uploadStreamToPublicBucket({
          bucket,
          objectPath,
          filePath: tempPath,
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
          upsert: true,
          metadata: {
            originalName: displayName,
            uploadedBy: String(memberId),
          },
        });
        url = publicUrl;
      } else {
        const buf = await fsp.readFile(tempPath);
        const { publicUrl } = await uploadBufferToPublicBucket({
          bucket,
          objectPath,
          file: buf,
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
          upsert: true,
          metadata: {
            originalName: displayName,
            uploadedBy: String(memberId),
          },
        });
        url = publicUrl;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[messenger] Supabase upload failed:', msg);
      if (/bucket not found/i.test(msg)) {
        res.status(503).json({
          error:
            `В Supabase нет бакета «${bucket}». Выполните scripts/ensure-supabase-storage-buckets.sql в Dashboard → SQL (или supabase db push), либо задайте SUPABASE_STORAGE_BUCKET_MESSENGER на id уже существующего бакета.`,
          code: 'storage_bucket_not_found',
          bucket,
        });
        return;
      }
      res.status(502).json({ error: 'Storage upload failed', code: 'supabase_upload' });
      return;
    }
    if (!url) {
      res.status(502).json({ error: 'Storage upload failed', code: 'supabase_upload' });
      return;
    }

    console.log('[messenger] upload:', {
      user: memberId,
      path: objectPath,
      mimeType,
      size: file.size,
    });

    res.json({
      url,
      name: displayName || (objectPath.split('/').pop() ?? 'file'),
      objectPath,
      mimeType,
      size: file.size,
    });
  } catch (e) {
    console.error('[messenger] upload handler error:', e);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed', code: 'upload_handler' });
    }
  } finally {
    if (tempPath) {
      await fsp.unlink(tempPath).catch(() => {});
    }
  }
});

// ─── Conversations ────────────────────────────────────────────

/** GET /api/messenger/conversations */
router.get('/conversations', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const startedAt = Date.now();
  const assistantAllowed = canAccessMessengerAssistant(sessionRoles(req));
  try {
    // Гарантируем личный чат «ИИ помощник» только для членов церкви (не прихожан).
    if (assistantAllowed) {
      try {
        const ensured = await ensureAssistantConversation(userId);
        ensureMemberInRoom(userId, ensured.conversationId);
      } catch (ensureErr) {
        console.warn('[messenger] ensure assistant on list failed:', ensureErr);
      }
    }
    let list = await svc.listConversations(userId);
    if (!assistantAllowed) {
      list = list.filter((c) => !svc.isMessengerAssistantChannelMetadata(c.metadata));
    }
    res.setHeader('Server-Timing', `listConversations;dur=${Date.now() - startedAt}`);
    res.json(list);
  } catch (e) {
    console.error('[messenger] listConversations error:', e);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

/** POST /api/messenger/conversations/personal { otherMemberId } */
router.post('/conversations/personal', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const { otherMemberId } = req.body;
  if (!otherMemberId || typeof otherMemberId !== 'number') {
    res.status(400).json({ error: 'otherMemberId is required' });
    return;
  }
  try {
    const convId = await svc.findOrCreatePersonalConversation(userId, otherMemberId);
    // Ensure both members join the WS room
    ensureMemberInRoom(userId, convId);
    ensureMemberInRoom(otherMemberId, convId);
    const convKey = String(convId);
    const convForMe = await getConversationListItemForMember(userId, convKey);
    // Notify the other member about new conversation (shape must be from THEIR perspective)
    const convForOther = await getConversationListItemForMember(otherMemberId, convKey);
    if (convForOther) {
      sendToMember(otherMemberId, { type: 'conv:created', conversation: convForOther });
    }
    res.json({ conversationId: convKey, conversation: convForMe ?? null });
  } catch (e: unknown) {
    console.error('[messenger] createPersonalConversation error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to create conversation';
    res.status(400).json({ error: msg });
  }
});

/** POST /api/messenger/conversations/group { title, type, memberIds } */
router.post('/conversations/group', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const { title, type, memberIds } = req.body;
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  const convType = type === 'channel' ? 'channel' : 'group';
  const ids: number[] = Array.isArray(memberIds)
    ? memberIds.filter((id: unknown): id is number => typeof id === 'number')
    : [];
  try {
    const convId = await svc.createGroupConversation(userId, title, convType, ids);
    const convKey = String(convId);
    // Ensure all members join the WS room
    ensureMemberInRoom(userId, convKey);
    for (const mId of ids) ensureMemberInRoom(mId, convKey);

    const convForMe = await getConversationListItemForMember(userId, convKey);

    // Notify invitees (their list row shape differs from the owner's).
    for (const mId of ids) {
      const convForMember = await getConversationListItemForMember(mId, convKey);
      if (convForMember) {
        sendToMember(mId, { type: 'conv:created', conversation: convForMember });
      }
    }
    // Creator never receives `conv:created` via the loop above — broadcast so their chat list updates on any device.
    if (convForMe) {
      sendToMember(userId, { type: 'conv:created', conversation: convForMe });
    }

    void (async () => {
      try {
        const inviterName = await getMemberDisplayName(userId);
        const cmeta = await svc.getConversationMeta(convKey);
        const chatLabel =
          cmeta?.title?.trim() ||
          title.trim() ||
          (convType === 'channel' ? 'Канал' : 'Группа');
        const kindWord = convType === 'channel' ? 'канал' : 'группу';
        for (const mId of ids) {
          await sendPushNotification(mId, {
            title: `Вас добавили в ${kindWord} «${chatLabel}»`,
            body: `${inviterName} пригласил(а) вас`,
            senderName: inviterName,
            conversationId: convKey,
            url: resolveMessengerConversationDeepLink(convKey),
            tag: `chat-added-${convKey}`,
            renotify: true,
            badge: '/assets/pwa-64x64.png',
            icon: '/assets/pwa-192x192.png',
          });
        }
      } catch (e) {
        console.warn('[messenger] create group push failed (best-effort):', e);
      }
    })();

    res.json({ conversationId: convKey, conversation: convForMe ?? null });
  } catch (e) {
    console.error('[messenger] createGroupConversation error:', e);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

/** GET /api/messenger/conversations/:id/participants */
router.get('/conversations/:id/participants', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const participants = await svc.getConversationParticipants(convId);
    res.json(participants);
  } catch (e) {
    console.error('[messenger] getParticipants error:', e);
    res.status(500).json({ error: 'Failed to load participants' });
  }
});

/** GET /api/messenger/conversations/:id/meta */
router.get('/conversations/:id/meta', checkChatPermission('view'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  try {
    const meta = await svc.getConversationMeta(convId);
    if (!meta) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const auth = req.chatAuth!;
    let myLastRead: string | null = null;
    try {
      myLastRead = await svc.getParticipantLastReadMessageId(convId, auth.memberId);
    } catch (e) {
      console.warn('[messenger] getParticipantLastReadMessageId:', e);
    }
    res.json({
      ...meta,
      my_role: auth.role,
      my_effective_permissions: auth.effective,
      my_last_read_message_id: myLastRead,
    });
  } catch (e) {
    console.error('[messenger] getConversationMeta error:', e);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

/** GET /api/messenger/conversations/:id/private-profile */
router.get('/conversations/:id/private-profile', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  try {
    const profile = await svc.getPrivateChatProfile(convId, userId);
    if (!profile) {
      res.status(404).json({ error: 'Profile not found (not a private chat?)' });
      return;
    }
    res.json(profile);
  } catch (e) {
    console.error('[messenger] getPrivateChatProfile error:', e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

/** GET /api/messenger/conversations/:id/members */
router.get('/conversations/:id/members', checkChatPermission('view'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  try {
    const members = await svc.listConversationMembers(convId);
    res.json(
      members.map((m) => ({
        ...m,
        is_online: isMemberOnline(m.member_id),
      })),
    );
  } catch (e) {
    console.error('[messenger] listConversationMembers error:', e);
    res.status(500).json({ error: 'Failed to load members' });
  }
});

/** PATCH /api/messenger/conversations/:id/permissions { default_permissions?, settings? } */
router.patch('/conversations/:id/permissions', checkChatPermission('manage_chat'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  const { default_permissions, settings } = req.body ?? {};
  try {
    await svc.updateConversationPermissionsAndSettings(convId, { default_permissions, settings });
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] patchConversationPermissions error:', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('DB schema is outdated')) {
      res.status(503).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

/** PATCH /api/messenger/conversations/:id/members/:memberId { role?, permissions?, muted_until? } */
router.patch('/conversations/:id/members/:memberId', checkChatPermission('set_permissions'), async (req: Request, res: Response) => {
  const convId = String(req.params.id);
  const targetId = Number(req.params.memberId);
  const { role, permissions, muted_until } = req.body ?? {};
  try {
    await svc.updateMemberRoleAndPermissions(convId, targetId, { role, permissions, muted_until });
    // Notify the updated member (refresh list)
    const convForMember = await getConversationListItemForMember(targetId, String(convId));
    if (convForMember) {
      sendToMember(targetId, { type: 'conv:created', conversation: convForMember });
    }
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] patchMemberPermissions error:', e);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

/** PATCH /api/messenger/conversations/:id  { title?, avatar_url? } — только с правом «управлять чатом» */
router.patch('/conversations/:id', checkChatPermission('manage_chat'), async (req: Request, res: Response) => {
  const convId = req.params.id;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const updates: { title?: string; avatar_url?: string | null } = {};
    if (typeof body.title === 'string') {
      updates.title = body.title;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar_url') || Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
      const v = body.avatar_url !== undefined ? body.avatar_url : body.avatarUrl;
      if (v === null) {
        updates.avatar_url = null;
      } else if (typeof v === 'string') {
        updates.avatar_url = v.trim();
      }
    }
    await svc.updateConversation(convId, updates);
    const meta = await svc.getConversationMeta(String(convId));
    const convKey = String(convId);
    if (meta) {
      sendToRoomAll(convKey, {
        type: 'conv:updated',
        conversationId: convKey,
        conversation: {
          avatar_url: meta.avatar_url,
          title: meta.title,
          updated_at: meta.updated_at,
        },
      });
    } else {
      sendToRoomAll(convKey, { type: 'conv:updated', conversationId: convKey });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] updateConversation error:', e);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/** PATCH /api/messenger/conversations/:id/my-ui — закрепить в списке, папка, без звука (только для себя) */
router.patch('/conversations/:id/my-ui', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const body = req.body ?? {};
  const patch: {
    muted?: boolean;
    uiPinned?: boolean;
    uiFolder?: 'personal' | 'ministry' | null;
  } = {};
  if (typeof body.muted === 'boolean') patch.muted = body.muted;
  if (typeof body.uiPinned === 'boolean') patch.uiPinned = body.uiPinned;
  if ('uiFolder' in body) {
    const v = body.uiFolder;
    patch.uiFolder = v === 'personal' || v === 'ministry' ? v : null;
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid fields: muted, uiPinned, uiFolder' });
    return;
  }
  try {
    await svc.patchMyConversationUi(convId, userId, patch);
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Forbidden') {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('[messenger] patchMyConversationUi error:', e);
    res.status(500).json({ error: 'Failed to update chat preferences' });
  }
});

/** POST /api/messenger/conversations/:id/clear-history — удалить все сообщения для всех */
router.post('/conversations/:id/clear-history', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  try {
    await svc.clearConversationHistory(convId, userId);
    sendToRoomAll(convId, { type: 'conv:history_cleared', conversationId: convId });
    sendToRoomAll(convId, { type: 'conv:updated', conversationId: convId });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Forbidden') {
      res.status(403).json({ error: msg });
      return;
    }
    console.error('[messenger] clearConversationHistory error:', e);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

/** POST /api/messenger/conversations/:id/participants { memberId } */
router.post(
  '/conversations/:id/participants',
  checkChatPermission('add_users'),
  async (req: Request, res: Response) => {
    const userId = (req as AuthReq).authUserId!;
    const convId = req.params.id;
    const { memberId } = req.body ?? {};
    const parsed = Number(memberId);
    if (!Number.isFinite(parsed) || parsed < 1) {
      res.status(400).json({ error: 'memberId must be a positive number' });
      return;
    }
    try {
      const type = await svc.getConversationType(String(convId));
      if (!type) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (type === 'private') {
        res.status(400).json({ error: 'Cannot add participants to a private chat' });
        return;
      }

      const alreadyActive = await svc.isMemberInConversation(String(convId), parsed);
      if (alreadyActive) {
        res.json({ ok: true, alreadyMember: true });
        return;
      }

      await svc.addParticipant(convId, parsed);
      ensureMemberInRoom(parsed, String(convId));
      const convForMember = await getConversationListItemForMember(parsed, String(convId));
      if (convForMember) {
        sendToMember(parsed, { type: 'conv:created', conversation: convForMember });
      }
      sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });

      void (async () => {
        try {
          const inviterName = await getMemberDisplayName(userId);
          const cmeta = await svc.getConversationMeta(String(convId));
          const chatLabel =
            cmeta?.title?.trim() ||
            convForMember?.title?.trim() ||
            (cmeta?.type === 'channel' ? 'Канал' : 'Группа');
          await sendPushNotification(parsed, {
            title: `Вас добавили в чат «${chatLabel}»`,
            body: `${inviterName} добавил(а) вас в чат`,
            senderName: inviterName,
            conversationId: String(convId),
            url: resolveMessengerConversationDeepLink(String(convId)),
            tag: `chat-added-${String(convId)}`,
            renotify: true,
            badge: '/assets/pwa-64x64.png',
            icon: '/assets/pwa-192x192.png',
          });
        } catch (e) {
          console.warn('[messenger] addParticipant push failed (best-effort):', e);
        }
      })();

      res.json({ ok: true });
    } catch (e) {
      console.error('[messenger] addParticipant error:', e);
      res.status(500).json({ error: 'Failed to add participant' });
    }
  },
);

/** DELETE /api/messenger/conversations/:id/participants/:memberId */
router.delete('/conversations/:id/participants/:memberId', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const targetId = Number(req.params.memberId);

  try {
    const convType = await svc.getConversationType(convId);
    if (!convType) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if (convType === 'private' && targetId !== userId) {
      res.status(400).json({ error: 'Cannot remove another member from private chat' });
      return;
    }

    // Self-leave is always allowed for an active member (group/channel/private).
    if (targetId !== userId) {
      const auth = req.chatAuth;
      const appAdmin = await svc.isMemberAppAdministrator(userId);
      const canKickByRole = auth?.role === 'owner' || auth?.role === 'admin';
      const canKickByPermission = auth?.effective?.can_manage_chat === true;
      if (!canKickByRole && !canKickByPermission && !appAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }
    await svc.removeParticipant(convId, targetId);
    sendToRoomAll(convId, { type: 'conv:updated', conversationId: convId });
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] removeParticipant error:', e);
    res.status(500).json({ error: 'Failed to remove participant' });
  }
});

/** GET /api/messenger/conversations/:id/pinned-messages */
router.get('/conversations/:id/pinned-messages', checkChatPermission('view'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 15));
  try {
    const list = await svc.listPinnedMessages(convId, userId, limit);
    res.json(list);
  } catch (e) {
    console.error('[messenger] listPinnedMessages error:', e);
    res.status(500).json({ error: 'Failed to load pinned messages' });
  }
});

/** POST /api/messenger/conversations/:id/pins { messageId } */
router.post('/conversations/:id/pins', checkChatPermission('pin_messages'), async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = String(req.params.id);
  const messageId = req.body?.messageId;
  if (messageId == null || !/^\d+$/.test(String(messageId).trim())) {
    res.status(400).json({ error: 'messageId is required' });
    return;
  }
  try {
    await svc.pinMessageInConversation(convId, String(messageId).trim(), userId);
    sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'Message not found') {
      res.status(404).json({ error: msg });
      return;
    }
    console.error('[messenger] pinMessage error:', e);
    res.status(500).json({ error: 'Failed to pin message' });
  }
});

/** DELETE /api/messenger/conversations/:id/pins/:messageId */
router.delete(
  '/conversations/:id/pins/:messageId',
  checkChatPermission('pin_messages'),
  async (req: Request, res: Response) => {
    const convId = String(req.params.id);
    const msgId = String(req.params.messageId || '').trim();
    if (!/^\d+$/.test(msgId)) {
      res.status(400).json({ error: 'Invalid messageId' });
      return;
    }
    try {
      await svc.unpinMessageInConversation(convId, msgId);
      sendToRoomAll(String(convId), { type: 'conv:updated', conversationId: String(convId) });
      res.json({ ok: true });
    } catch (e) {
      console.error('[messenger] unpinMessage error:', e);
      res.status(500).json({ error: 'Failed to unpin message' });
    }
  },
);

// ─── Messages ─────────────────────────────────────────────────

/** GET /api/messenger/conversations/:id/messages?before=<id>|after=<id>&limit=50 */
router.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const startedAt = Date.now();
  const convId = req.params.id;
  const before = (req.query.before as string) || undefined;
  const after = (req.query.after as string) || undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  try {
    if (before && after) {
      res.status(400).json({ error: 'Use either before or after, not both' });
      return;
    }
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const messages = after
      ? await svc.loadMessagesAfter(convId, userId, after, limit)
      : await svc.loadMessages(convId, userId, limit, before);
    res.setHeader('Server-Timing', `loadMessages;dur=${Date.now() - startedAt}`);
    res.json(messages);
  } catch (e) {
    console.error('[messenger] loadMessages error:', e);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

/** POST /api/messenger/conversations/:id/messages { content, replyToMessageId? } */
router.post(
  '/conversations/:id/messages',
  validateSendMessage,
  ensureValidRequest,
  checkChatPermission('send_message'),
  async (req: Request, res: Response) => {
    const userId = (req as AuthReq).authUserId!;
    const convId = req.params.id;
    const { content, replyToMessageId, clientMsgId, payloadType, payload } = req.body;
    const requestStartedAt = Date.now();
    const pt =
      payloadType === 'prayer_request' ||
      payloadType === 'text' ||
      payloadType === 'audio' ||
      payloadType === 'video_note' ||
      payloadType === 'image' ||
      payloadType === 'file' ||
      payloadType === 'poll'
        ? payloadType
        : 'text';
    const pl =
      payload != null && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {};
    const replyId = normalizeOptionalBigintId(replyToMessageId);
    try {
      if (
        (pt === 'image' || pt === 'file' || pt === 'audio' || pt === 'video_note') &&
        req.chatAuth &&
        !req.chatAuth.effective.can_send_media
      ) {
        res.status(403).json({ error: 'Отправка медиа и файлов отключена в этом чате' });
        return;
      }
      const safeClientMsgId =
        typeof clientMsgId === 'string' && clientMsgId.trim()
          ? clientMsgId.trim().slice(0, 160)
          : `srv-${randomUUID()}`;
      const convKey = String(convId);
      const prepared = await svc.prepareMessageForSend(convId, userId, content, replyId, safeClientMsgId, pt, pl);
      // Акк только отправителю — это не «сообщение в комнате», а подтверждение
      // приёма запроса сервером; ни у кого в чате ещё нет этого сообщения.
      sendToMember(userId, {
        type: 'msg:server_ack',
        conversationId: convKey,
        clientMsgId: safeClientMsgId,
      });

      // Сохраняем в БД СНАЧАЛА, и только после успешной записи рассылаем `msg:new`.
      // Ранее использовался early-fanout «до INSERT», но он создавал две патологии:
      //   1) получатели видели `pending-<uuid>`, которого нет в БД → 404 на reply/reactions;
      //   2) при ошибке INSERT оставался «призрак», который `msg:send_failed` лишь помечал.
      let persistResult: Awaited<ReturnType<typeof svc.persistPreparedMessage>>;
      try {
        persistResult = await svc.persistPreparedMessage(prepared);
      } catch (persistErr) {
        console.error('[messenger] persistPreparedMessage failed:', persistErr);
        // Поскольку fan-out не было, говорить об ошибке нужно только отправителю
        // (его другие вкладки могли получить `msg:server_ack`).
        sendToMember(userId, {
          type: 'msg:send_failed',
          conversationId: convKey,
          clientMsgId: safeClientMsgId,
          reason: 'db_error',
        });
        res.status(503).json({ error: 'Failed to save message' });
        return;
      }

      const { message, isNew } = persistResult;
      // Явный флаг для клиентского счётчика: только is_read === false считается непрочитанным.
      const messageForRealtime = { ...message, is_read: false as const };

      if (isNew) {
        // Свежая вставка — первый и единственный fan-out на комнату.
        sendToRoomAll(convKey, { type: 'msg:new', conversationId: convKey, message: messageForRealtime });
      } else {
        // Идемпотентный повтор (клиент ретраил тот же `client_msg_id`).
        // Остальные участники уже получили `msg:new` и push при первой вставке —
        // повторно их тревожить нельзя. Отправляем только отправителю, чтобы его
        // другие устройства могли заменить `temp-*`/`pending-*` на финальный id.
        sendToMember(userId, { type: 'msg:new', conversationId: convKey, message: messageForRealtime });
      }

      res.json({
        ...messageForRealtime,
        send_api_ms: Date.now() - requestStartedAt,
      });

      // Push-уведомления: ТОЛЬКО при первой вставке. Для ретраев тот же
      // `client_msg_id` уже приводил к пушу ранее; второй push — дубль у получателя.
      if (!isNew) {
        return;
      }

      // ИИ помощник: ответ после успешной записи пользовательского текста.
      if (pt === 'text' && canAccessMessengerAssistant(sessionRoles(req))) {
        void (async () => {
          try {
            const cmeta = await svc.getConversationMeta(convKey);
            if (!svc.isMessengerAssistantChannelMetadata(cmeta?.metadata)) return;
            await replyAsAssistantBot({
              conversationId: convKey,
              memberId: userId,
              userMessageId: String(message.id),
              userText: String(message.content ?? content ?? ''),
            });
          } catch (assistantErr) {
            console.warn('[messenger] assistant reply failed:', assistantErr);
          }
        })();
      }

      void (async () => {
        try {
        const memberIds = await svc.getConversationMemberIds(convKey);
        const recipients = memberIds.filter((id) => Number(id) !== Number(userId));
        const senderName = message.sender_name ?? 'Новое сообщение';
        const ptype = String(message.payload_type ?? 'text');
        const bodyText =
          String(message.content ?? '').trim() ||
          (ptype === 'poll'
            ? '📊 Опрос'
            : ptype === 'audio'
              ? '🎤 Голосовое сообщение'
              : ptype === 'video_note'
                ? '🎥 Видеосообщение'
                : ptype !== 'text'
                  ? 'Вложение'
                  : 'Новое сообщение');
        const mpl =
          message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : undefined;
        const mentionIds = Array.isArray(mpl?.mention_member_ids)
          ? (mpl.mention_member_ids as unknown[])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && n > 0)
          : [];
        const mentionSet = new Set(mentionIds);
        let chatLabel = 'Чат';
        try {
          const cmeta = await svc.getConversationMeta(convKey);
          if (cmeta?.title?.trim()) chatLabel = cmeta.title.trim();
          else if (cmeta?.type === 'group') chatLabel = 'Группа';
          else if (cmeta?.type === 'channel') chatLabel = 'Канал';
        } catch {
          /* ignore */
        }
        const previewShort =
          bodyText.length > 160 ? `${bodyText.slice(0, 157).trim()}…` : bodyText;

        const batchSize = 8;
        for (let i = 0; i < recipients.length; i += batchSize) {
          const batch = recipients.slice(i, i + batchSize);
          await Promise.allSettled(batch.map(async (rid) => {
          const r = Number(rid);
          if (await svc.isConversationMutedForMember(convKey, r)) return;
          const mentioned = mentionSet.has(r);
          const payload = {
            title: mentioned ? `Вас упомянули в «${chatLabel}»` : senderName,
            body: mentioned ? `${senderName}: ${previewShort || 'Сообщение'}` : bodyText,
            senderName,
            conversationId: convKey,
            messageId: String(message.id ?? ''),
            url: resolveMessengerConversationDeepLink(convKey),
            tag: `chat-${convKey}`,
            renotify: true,
            badge: '/assets/pwa-64x64.png',
            icon: '/assets/pwa-192x192.png',
            actions: [
              { action: 'reply', title: 'Ответить' },
              { action: 'dismiss', title: 'Закрыть' },
            ],
          };
          await sendPushNotification(r, payload);
          }));
        }
        } catch (e) {
          console.warn('[messenger] push notify failed (best-effort):', e);
        }
      })();
    } catch (e) {
      const obj: Record<string, unknown> | null = e && typeof e === 'object' ? (e as Record<string, unknown>) : null;
      const message =
        e instanceof Error ? e.message : (typeof obj?.message === 'string' ? obj.message : String(e));
      const code = typeof obj?.code === 'string' ? obj.code : undefined;
      const detail = typeof obj?.detail === 'string' ? obj.detail : undefined;
      const hint = typeof obj?.hint === 'string' ? obj.hint : undefined;

      if (
        e instanceof Error &&
        (/^Poll\b|^Invalid poll/i.test(message) ||
          message.includes('option') ||
          message.includes('question'))
      ) {
        res.status(400).json({ error: message });
        return;
      }

      // Helpful for DB errors without leaking request body contents.
      console.error('[messenger] sendMessage error:', { message, code, detail, hint });
      res.status(500).json({ error: 'Failed to send message' });
    }
  },
);

/** POST /api/messenger/messages/:id/poll-vote { optionIndexes: number[] } */
router.post(
  '/messages/:id/poll-vote',
  attachConversationFromMessageIdParam,
  checkChatPermission('send_message'),
  async (req: Request, res: Response) => {
    const userId = (req as AuthReq).authUserId!;
    const msgId = req.params.id;
    const raw = req.body?.optionIndexes;
    const optionIndexes = Array.isArray(raw) ? raw.map((x) => Number(x)) : [];
    if (raw != null && !Array.isArray(raw)) {
      res.status(400).json({ error: 'optionIndexes must be an array' });
      return;
    }
    try {
      const result = await svc.votePollMessage(msgId, userId, optionIndexes);
      const ck = result.conversationId;
      sendToRoomAll(ck, {
        type: 'msg:poll',
        conversationId: ck,
        messageId: String(msgId),
        tallies: result.tallies,
      });
      res.json({ tallies: result.tallies, my_options: result.my_options });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Forbidden') {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (message === 'Message not found' || message === 'Not a poll message' || message === 'Invalid message id') {
        res.status(404).json({ error: message });
        return;
      }
      if (
        message === 'Invalid poll' ||
        message === 'This poll allows only one answer' ||
        message.includes('answer')
      ) {
        res.status(400).json({ error: message });
        return;
      }
      console.error('[messenger] poll-vote error:', e);
      res.status(500).json({ error: 'Failed to record vote' });
    }
  },
);

/** GET /api/messenger/messages/:id/poll-voters — who voted for each option (chat members only). */
router.get('/messages/:id/poll-voters', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(msgId)) {
    res.status(400).json({ error: 'Invalid message id' });
    return;
  }
  try {
    const result = await svc.getPollVotersForMember(msgId, userId);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Message not found' || message === 'Not a poll message' || message === 'Invalid message id') {
      res.status(404).json({ error: message });
      return;
    }
    if (message === 'Invalid poll') {
      res.status(400).json({ error: message });
      return;
    }
    console.error('[messenger] poll-voters error:', e);
    res.status(500).json({ error: 'Failed to load poll voters' });
  }
});

/** PATCH /api/messenger/messages/:id { content } */
router.get('/messages/:id/attachment-url', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(msgId)) {
    res.status(400).json({ error: 'Invalid message id' });
    return;
  }
  try {
    const slotRaw = req.query.slot;
    let slot: number | undefined;
    if (slotRaw != null && String(slotRaw).trim() !== '') {
      const n = Number(slotRaw);
      if (Number.isFinite(n) && n >= 0 && n <= 32) slot = Math.floor(n);
    }
    const item = await svc.getMessageAttachmentForMember(msgId, userId, slot);
    if (!item) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const bucket = messengerBucket();
    if (item.url && isMessengerPublicObjectUrl(item.url, bucket)) {
      res.json({
        url: rewriteSupabaseStorageUrlForClient(item.url),
        source: 'stored',
      });
      return;
    }
    if (item.objectPath && isSupabaseStorageConfigured()) {
      try {
        const ttl = attachmentSignedUrlTtlSec();
        const { signedUrl } = await createSignedUrlForBucketObject({
          bucket,
          objectPath: item.objectPath,
          expiresInSec: ttl,
        });
        res.json({
          url: signedUrl,
          source: 'signed',
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
        });
        return;
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const slotLabel = slot != null ? String(slot) : '';
        console.warn(
          `[messenger] attachment signed URL failed msg=${msgId} slot=${slotLabel} path=${item.objectPath}: ${detail}`,
        );
      }
    }
    if (!item.url) {
      res.status(404).json({ error: 'Attachment URL not found' });
      return;
    }
    res.json({ url: rewriteSupabaseStorageUrlForClient(item.url), source: 'stored' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    console.error('[messenger] get attachment URL error:', e);
    res.status(500).json({ error: 'Failed to load attachment URL' });
  }
});

/**
 * GET /api/messenger/messages/:id/attachment-file
 * Прокси вложения через API (тот же origin + cookie) — открытие и скачивание документов без CORS Storage.
 * Query: slot (альбом), download=1 — Content-Disposition: attachment.
 */
router.get('/messages/:id/attachment-file', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = String(req.params.id || '').trim();
  if (!/^\d+$/.test(msgId)) {
    res.status(400).json({ error: 'Invalid message id' });
    return;
  }
  const dlRaw = String(req.query.download ?? '').trim().toLowerCase();
  const forceDownload = dlRaw === '1' || dlRaw === 'true' || dlRaw === 'yes';
  const transcodeRaw = String(req.query.transcode ?? '').trim().toLowerCase();
  const wantsMp4Transcode = transcodeRaw === 'mp4';
  try {
    const slotRaw = req.query.slot;
    let slot: number | undefined;
    if (slotRaw != null && String(slotRaw).trim() !== '') {
      const n = Number(slotRaw);
      if (Number.isFinite(n) && n >= 0 && n <= 32) slot = Math.floor(n);
    }
    const item = await svc.getMessageAttachmentForMember(msgId, userId, slot);
    if (!item) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const origType = (item.mimeType || '').trim().toLowerCase();
    const origName = (item.fileName || '').trim().toLowerCase();
    const isWebmLike = origType.startsWith('video/webm') || origName.endsWith('.webm');
    let { buffer, contentType } = await loadMessengerAttachmentBytesForProxy(item);
    let fileName = item.fileName;

    if (wantsMp4Transcode && isWebmLike) {
      const mp4 = await transcodeWebmBufferToMp4(buffer);
      if (mp4) {
        if (mp4.length <= MESSENGER_ATTACHMENT_PROXY_MAX_BYTES) {
          buffer = mp4;
          contentType = 'video/mp4';
          fileName = withMp4Extension(fileName);
        } else {
          console.warn('[messenger] transcoded mp4 is too large for proxy response');
        }
      }
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader(
      'Content-Disposition',
      messengerAttachmentContentDisposition(forceDownload, fileName),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Attachment too large') {
      res.status(413).json({ error: 'Attachment too large' });
      return;
    }
    console.error('[messenger] attachment-file proxy error:', e);
    res.status(500).json({ error: 'Failed to load attachment' });
  }
});

/** PATCH /api/messenger/messages/:id { content } */
router.patch('/messages/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const { content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    res.status(400).json({ error: 'Content is required' });
    return;
  }
  try {
    const result = await svc.editMessage(msgId, userId, content);
    if (!result) {
      res.status(404).json({ error: 'Message not found or not yours' });
      return;
    }
    // Find which conversation this message belongs to and broadcast
    // (We need to query the message to get conversation_id)
    try {
      const { query: dbQuery } = await import('../config/db');
      const msgRow = await dbQuery('SELECT conversation_id FROM messages WHERE id = $1', [msgId]);
      const cId = msgRow.rows[0]?.conversation_id;
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:edited',
          conversationId: ck,
          messageId: msgId,
          content: result.content,
          updatedAt: result.updated_at,
        });
      }
    } catch { /* broadcast best-effort */ }
    res.json(result);
  } catch (e) {
    console.error('[messenger] editMessage error:', e);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

/** DELETE /api/messenger/messages/:id */
router.delete('/messages/:id', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  try {
    // Get conversation_id before deleting
    let cId: string | null = null;
    try {
      const { query: dbQuery } = await import('../config/db');
      const msgRow = await dbQuery('SELECT conversation_id FROM messages WHERE id = $1', [msgId]);
      cId = msgRow.rows[0]?.conversation_id ? String(msgRow.rows[0].conversation_id) : null;
    } catch { /* ignore */ }
    const ok = await svc.deleteMessage(msgId, userId);
    if (!ok) {
      res.status(404).json({ error: 'Message not found or not yours' });
      return;
    }
    if (cId) {
      const ck = String(cId);
      sendToRoomAll(ck, { type: 'msg:deleted', conversationId: ck, messageId: msgId });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[messenger] deleteMessage error:', e);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// ─── Read Receipts ────────────────────────────────────────────

/** POST /api/messenger/conversations/:id/read { messageId?, readAt? } */
router.post('/conversations/:id/read', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const rawMessageId = req.body?.messageId ?? req.body?.lastReadMessageId;
  const messageId = String(rawMessageId ?? '').trim();
  if (!messageId) {
    res.json({ ok: true, updated: false });
    return;
  }
  const readAt = String(req.body?.readAt ?? req.body?.read_at ?? '').trim();
  if (readAt && Number.isNaN(Date.parse(readAt))) {
    res.status(400).json({ error: 'readAt must be a valid ISO datetime' });
    return;
  }
  if (!/^\d+$/.test(messageId)) {
    res.status(400).json({ error: 'messageId must be numeric' });
    return;
  }
  try {
    const updated = await svc.markRead(convId, userId, {
      lastReadMessageId: /^\d+$/.test(messageId) ? messageId : null,
      readAt: readAt || null,
    });
    if (updated && /^\d+$/.test(messageId)) {
      // Notify other participants (Telegram-like read cursor).
      sendToRoom(String(convId), {
        type: 'messages_read',
        chatId: String(convId),
        userId,
        lastReadMessageId: messageId,
      }, userId);
      // Backward compatibility for existing frontend handler.
      sendToRoom(String(convId), {
        type: 'read:updated',
        conversationId: String(convId),
        memberId: userId,
        lastReadMessageId: messageId,
      }, userId);
    }
    res.json({ ok: true, updated });
  } catch (e) {
    console.error('[messenger] markRead error:', e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('Invalid messageId') || message.includes('Invalid read marker')) {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

/** GET /api/messenger/unread-count */
router.get('/unread-count', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  try {
    const count = await svc.getTotalUnreadCount(userId);
    res.json({ count });
  } catch (e) {
    console.error('[messenger] unreadCount error:', e);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ─── Reactions ────────────────────────────────────────────────

/** POST /api/messenger/messages/:id/reactions { emoji } */
router.post('/messages/:id/reactions', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const { emoji } = req.body;
  if (!emoji || typeof emoji !== 'string') {
    res.status(400).json({ error: 'emoji is required' });
    return;
  }
  try {
    const inserted = await svc.addReaction(msgId, userId, emoji);
    if (inserted) {
      const cId = await svc.getMessageConversationId(msgId);
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:reaction',
          conversationId: ck,
          messageId: msgId,
          emoji,
          memberId: userId,
          action: 'add',
        });

        void (async () => {
          try {
            const ownerId = await svc.getMessageSenderId(msgId);
            if (!ownerId || Number(ownerId) === Number(userId)) return;
            if (await svc.isConversationMutedForMember(ck, ownerId)) return;

            const reactorName = await getMemberDisplayName(userId);
            await sendPushNotification(ownerId, {
              title: 'Новая реакция на ваше сообщение',
              body: `${reactorName} поставил(а) реакцию ${emoji}`,
              senderName: reactorName,
              conversationId: ck,
              messageId: String(msgId),
              url: resolveMessengerConversationDeepLink(ck),
              tag: `chat-${ck}`,
              renotify: true,
              badge: '/assets/pwa-64x64.png',
              icon: '/assets/pwa-192x192.png',
              actions: [
                { action: 'reply', title: 'Открыть чат' },
                { action: 'dismiss', title: 'Закрыть' },
              ],
            });
          } catch (e) {
            console.warn('[messenger] reaction push failed (best-effort):', e);
          }
        })();
      }
    }
    res.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Message not found') {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    console.error('[messenger] addReaction error:', e);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

/** DELETE /api/messenger/messages/:id/reactions/:emoji */
router.delete('/messages/:id/reactions/:emoji', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const msgId = req.params.id;
  const emoji = decodeURIComponent(req.params.emoji);
  try {
    const removed = await svc.removeReaction(msgId, userId, emoji);
    if (removed) {
      const cId = await svc.getMessageConversationId(msgId);
      if (cId) {
        const ck = String(cId);
        sendToRoomAll(ck, {
          type: 'msg:reaction',
          conversationId: ck,
          messageId: msgId,
          emoji,
          memberId: userId,
          action: 'remove',
        });
      }
    }
    res.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === 'Forbidden') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (message === 'Message not found') {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    console.error('[messenger] removeReaction error:', e);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// ─── Search Members ───────────────────────────────────────────

/** GET /api/messenger/members/search?q=... */
router.get('/members/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const q = (req.query.q as string || '').trim();
  try {
    if (q.length < 1) {
      const members = await svc.listRegisteredMembers(userId);
      res.json(members.map((m) => ({ ...m, is_online: isMemberOnline(m.id) })));
    } else {
      const members = await svc.searchMembers(q, userId);
      res.json(members.map((m) => ({ ...m, is_online: isMemberOnline(m.id) })));
    }
  } catch (e) {
    console.error('[messenger] searchMembers error:', e);
    res.status(500).json({ error: 'Failed to search members' });
  }
});

/** GET /api/messenger/members/:memberId — для deep link в черновик ЛС */
router.get('/members/:memberId', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const memberId = Number(req.params.memberId);
  if (!Number.isFinite(memberId) || memberId <= 0) {
    res.status(400).json({ error: 'Invalid member id' });
    return;
  }
  try {
    const member = await svc.getMemberByIdForMessenger(memberId, userId);
    if (!member) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    res.json({ ...member, is_online: isMemberOnline(member.id) });
  } catch (e) {
    console.error('[messenger] getMemberById error:', e);
    res.status(500).json({ error: 'Failed to load member' });
  }
});

// ─── Search Messages ──────────────────────────────────────────

/** GET /api/messenger/conversations/:id/search?q=... */
router.get('/conversations/:id/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const convId = req.params.id;
  const searchQuery = (req.query.q as string || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  if (!searchQuery) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const isMember = await svc.isMemberInConversation(convId, userId);
    if (!isMember) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }
    const messages = await svc.searchMessages(convId, searchQuery, userId, limit);
    res.json(messages);
  } catch (e) {
    console.error('[messenger] searchMessages error:', e);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

/** GET /api/messenger/search?q=...&limit=30 — global search across all user's conversations */
router.get('/search', async (req: Request, res: Response) => {
  const userId = (req as AuthReq).authUserId!;
  const searchQuery = (req.query.q as string || '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));

  if (!searchQuery) {
    res.status(400).json({ error: 'Search query is required' });
    return;
  }

  try {
    const results = await svc.searchAllMessages(searchQuery, userId, limit);
    res.json(results);
  } catch (e) {
    console.error('[messenger] searchAllMessages error:', e);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

export default router;
