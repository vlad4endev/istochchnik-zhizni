import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

let cached: SupabaseClient | null | undefined;

function getUrl(): string {
  return String(process.env.SUPABASE_URL ?? '').trim();
}

function getServiceRoleKey(): string {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/** Хост похож на LAN/Docker — переписываем Storage-URL на SUPABASE_STORAGE_PUBLIC_URL. */
function isLikelyInternalStorageHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'kong' || h === 'supabase_kong' || h.endsWith('.internal')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].some((n) => n > 255)) return false;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  return false;
}

/**
 * Публичный HTTPS-ориджин Storage для браузера (обычно `https://<ref>.supabase.co`).
 * Задайте, если `SUPABASE_URL` у API — внутренний (Docker/LAN), иначе в ответах попадут http://IP:port
 * и HTTPS-сайт заблокирует картинки (mixed content).
 */
export function getSupabaseStoragePublicOrigin(): string | null {
  const raw = process.env.SUPABASE_STORAGE_PUBLIC_URL?.trim();
  if (!raw) return null;
  try {
    return trimTrailingSlashes(new URL(raw).origin);
  } catch {
    return null;
  }
}

/** Префиксы URL, которые нужно заменить на публичный ориджин: SUPABASE_URL + опционально LAN/stage. */
function internalStorageUrlPrefixes(): string[] {
  const set = new Set<string>();
  const u = getUrl();
  if (u) {
    try {
      set.add(trimTrailingSlashes(new URL(u).origin));
    } catch {
      /* ignore */
    }
  }
  const legacy = process.env.SUPABASE_STORAGE_LEGACY_ORIGINS?.trim();
  if (legacy) {
    for (const part of legacy.split(',')) {
      const t = part.trim();
      if (!t) continue;
      try {
        const origin = new URL(t.includes('://') ? t : `http://${t}`).origin;
        set.add(trimTrailingSlashes(origin));
      } catch {
        set.add(trimTrailingSlashes(t));
      }
    }
  }
  return [...set];
}

/**
 * Подмена ориджина в URL Storage API (`/storage/v1/...`) для клиентов за HTTPS.
 * Без `SUPABASE_STORAGE_PUBLIC_URL` возвращает строку как есть.
 *
 * 1) Сначала заменяем известные внутренние префиксы (SUPABASE_URL, LEGACY_ORIGINS).
 * 2) Затем любой URL с путём `/storage/v1/` переносим на публичный origin+protocol
 *    из `SUPABASE_STORAGE_PUBLIC_URL` — лечит mixed content (http LAN → https сайт).
 */
export function rewriteSupabaseStorageUrlForClient(url: string): string {
  if (!url || typeof url !== 'string') return url;
  const publicOrigin = getSupabaseStoragePublicOrigin();
  if (!publicOrigin) return url;
  const trimmed = url.trim();
  for (const prefix of internalStorageUrlPrefixes()) {
    if (!prefix || prefix === publicOrigin) continue;
    if (trimmed === prefix || trimmed.startsWith(`${prefix}/`) || trimmed.startsWith(`${prefix}?`)) {
      return publicOrigin + trimmed.slice(prefix.length);
    }
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname.includes('/storage/v1/')) return url;
    const pub = new URL(publicOrigin.includes('://') ? publicOrigin : `https://${publicOrigin}`);
    if (parsed.origin === pub.origin) return trimmed;
    const host = parsed.hostname;
    const shouldRewriteHost =
      parsed.protocol === 'http:' || isLikelyInternalStorageHost(host);
    if (!shouldRewriteHost) return trimmed;
    parsed.protocol = pub.protocol;
    parsed.host = pub.host;
    return parsed.toString();
  } catch {
    /* ignore */
  }
  return url;
}

/** Поля вложений мессенджера / медиа, где может лежать абсолютный URL Storage. */
export function rewriteStorageUrlsInRecord(pl: Record<string, unknown>): Record<string, unknown> {
  if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return pl;
  const urlKeys = new Set(['url', 'signedUrl', 'signed_url', 'thumbnail_url', 'preview_url']);
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => walk(item));
    }
    if (!value || typeof value !== 'object') return value;

    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(src)) {
      if (typeof raw === 'string' && raw.length > 0 && urlKeys.has(key)) {
        out[key] = rewriteSupabaseStorageUrlForClient(raw);
        continue;
      }
      out[key] = walk(raw);
    }
    return out;
  };
  return walk(pl) as Record<string, unknown>;
}

export function getSupabaseStorageMissingEnv(): string[] {
  const missing: string[] = [];
  if (!getUrl()) missing.push('SUPABASE_URL');
  if (!getServiceRoleKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}

/** Storage включён для серверной загрузки (service role). */
export function isSupabaseStorageConfigured(): boolean {
  return getSupabaseStorageMissingEnv().length === 0;
}

/**
 * Проверка, что бакет существует в проекте (listBuckets + service role).
 * Нужна для /api/messenger/uploads/health и диагностики «Bucket not found» при upload.
 */
export async function verifyStorageBucketPresent(bucket: string): Promise<
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not_configured'
        | 'list_buckets_failed'
        | 'list_buckets_empty'
        | 'bucket_not_found';
      message?: string;
      existingBucketIds?: string[];
    }
> {
  const client = getClient();
  if (!client) return { ok: false, reason: 'not_configured' };
  const { data, error } = await client.storage.listBuckets();
  if (error) {
    return { ok: false, reason: 'list_buckets_failed', message: error.message };
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return { ok: false, reason: 'list_buckets_empty', message: 'empty_bucket_list' };
  }
  const ids = new Set<string>();
  for (const b of rows) {
    const row = b as { id?: string; name?: string };
    if (typeof row.id === 'string' && row.id) ids.add(row.id);
    if (typeof row.name === 'string' && row.name) ids.add(row.name);
  }
  if (ids.size === 0 && rows.length > 0) {
    return { ok: false, reason: 'list_buckets_empty', message: 'no_bucket_ids_in_response' };
  }
  if (ids.has(bucket)) return { ok: true };
  return { ok: false, reason: 'bucket_not_found', existingBucketIds: [...ids].sort() };
}

type StorageBucketVerifyFailure = Exclude<Awaited<ReturnType<typeof verifyStorageBucketPresent>>, { ok: true }>;

/** Проверка бакета недоступна (self-hosted / ограничения API) — не считаем Storage мёртвым. */
export function isStorageBucketHealthCheckInconclusive(v: StorageBucketVerifyFailure): boolean {
  return v.reason === 'list_buckets_failed' || v.reason === 'list_buckets_empty';
}

/**
 * Лог на старте API: `SUPABASE_STORAGE_PUBLIC_URL` нужен, если клиент Storage по HTTP
 * (Docker / LAN), иначе в JSON уйдут http://… ссылки на HTTPS-фронт (mixed content).
 * При `SUPABASE_URL` уже с `https:` (облако Supabase) предупреждение не нужно.
 */
export function shouldWarnMissingSupabaseStoragePublicUrl(): boolean {
  if (!isSupabaseStorageConfigured()) return false;
  if (getSupabaseStoragePublicOrigin()) return false;
  const raw = getUrl();
  if (!raw) return false;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return false;
    return true;
  } catch {
    return true;
  }
}

function getClient(): SupabaseClient {
  if (cached !== undefined) return cached as SupabaseClient;
  const url = getUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    cached = null;
    return cached as unknown as SupabaseClient;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Легаси из старого .env: бакет `messenger` в проекте не создаётся, в Storage используется id `chat`. */
let warnedMessengerBucketAlias = false;

/** Имя бакета для вложений чата; дефолт `chat` совпадает с `supabase/migrations/*storage_buckets_app_uploads.sql`. */
export function messengerBucket(): string {
  const raw = process.env.SUPABASE_STORAGE_BUCKET_MESSENGER?.trim();
  if (!raw) return 'chat';
  if (raw.toLowerCase() === 'messenger') {
    if (!warnedMessengerBucketAlias) {
      warnedMessengerBucketAlias = true;
      console.warn(
        '[storage] SUPABASE_STORAGE_BUCKET_MESSENGER=messenger: в Storage по умолчанию бакет id `chat` (см. scripts/ensure-supabase-storage-buckets.sql). Подмена на `chat`. Удалите переменную или задайте SUPABASE_STORAGE_BUCKET_MESSENGER=chat.',
      );
    }
    return 'chat';
  }
  return raw;
}

export function userMediaBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_USER_MEDIA?.trim() || 'user-media';
}

/** Загружает буфер в Storage, возвращает публичный URL (бакет должен быть public). */
export async function uploadBufferToPublicBucket(opts: {
  bucket: string;
  /** Ключ внутри бакета, без ведущего slash */
  objectPath: string;
  file: Buffer;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  /** По умолчанию false — для мессенджера передавайте true, чтобы перезапись по тому же пути не давала «тихий» облом. */
  upsert?: boolean;
}): Promise<{ publicUrl: string }> {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  const contentType =
    typeof opts.contentType === 'string' && opts.contentType.trim().length > 0
      ? opts.contentType.trim()
      : 'application/octet-stream';
  const { error } = await client.storage
    .from(opts.bucket)
    .upload(opts.objectPath, opts.file, {
      contentType,
      cacheControl: opts.cacheControl,
      metadata: opts.metadata,
      upsert: opts.upsert === true,
    });
  if (error) {
    throw new Error(`Storage upload failed [bucket=${opts.bucket}]: ${error.message}`);
  }
  const { data } = client.storage.from(opts.bucket).getPublicUrl(opts.objectPath);
  if (!data?.publicUrl) {
    throw new Error('Storage getPublicUrl returned empty URL');
  }
  return { publicUrl: rewriteSupabaseStorageUrlForClient(data.publicUrl) };
}

/**
 * Загрузка больших файлов с диска без чтения всего буфера в память (видео в мессенджере).
 * Требует Node stream + fetch с duplex (Supabase Storage API).
 */
export async function uploadStreamToPublicBucket(opts: {
  bucket: string;
  objectPath: string;
  filePath: string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  upsert?: boolean;
}): Promise<{ publicUrl: string }> {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  const contentType =
    typeof opts.contentType === 'string' && opts.contentType.trim().length > 0
      ? opts.contentType.trim()
      : 'application/octet-stream';
  const stream = createReadStream(opts.filePath);
  const { error } = await client.storage.from(opts.bucket).upload(opts.objectPath, stream as never, {
    contentType,
    cacheControl: opts.cacheControl,
    metadata: opts.metadata,
    upsert: opts.upsert === true,
    duplex: 'half',
  } as never);
  if (error) {
    throw new Error(`Storage upload failed [bucket=${opts.bucket}]: ${error.message}`);
  }
  const { data } = client.storage.from(opts.bucket).getPublicUrl(opts.objectPath);
  if (!data?.publicUrl) {
    throw new Error('Storage getPublicUrl returned empty URL');
  }
  return { publicUrl: rewriteSupabaseStorageUrlForClient(data.publicUrl) };
}

/** Скачивание объекта с сервера (service role) — для прокси вложений без CORS в браузере. */
export async function downloadBucketObject(opts: {
  bucket: string;
  objectPath: string;
}): Promise<{ buffer: Buffer; contentType: string | null }> {
  const client = getClient();
  const { data, error } = await client.storage.from(opts.bucket).download(opts.objectPath);
  if (error) {
    throw new Error(`Storage download failed [bucket=${opts.bucket}]: ${error.message}`);
  }
  if (!data) {
    throw new Error('Storage download returned empty body');
  }
  const ab = await data.arrayBuffer();
  const buffer = Buffer.from(ab);
  const ct = typeof Blob !== 'undefined' && data instanceof Blob && data.type ? String(data.type).trim() : '';
  return { buffer, contentType: ct || null };
}

export async function createSignedUrlForBucketObject(opts: {
  bucket: string;
  objectPath: string;
  expiresInSec: number;
}): Promise<{ signedUrl: string }> {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  const { data, error } = await client.storage
    .from(opts.bucket)
    .createSignedUrl(opts.objectPath, opts.expiresInSec);
  if (error) {
    throw new Error(`Storage createSignedUrl failed: ${error.message}`);
  }
  if (!data?.signedUrl) {
    throw new Error('Storage createSignedUrl returned empty URL');
  }
  return { signedUrl: rewriteSupabaseStorageUrlForClient(data.signedUrl) };
}

function messengerUploadExtension(extension: string): string {
  const ext = String(extension || '').trim();
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  return safeExt.startsWith('.') ? safeExt : safeExt ? `.${safeExt}` : '';
}

/** Легаси-путь: префикс memberId (до введения путей по чату). */
export function buildMessengerObjectPath(memberId: number, extension: string): string {
  const safeExt = messengerUploadExtension(extension);
  const id = randomUUID();
  return `${memberId}/${id}${safeExt}`;
}

/**
 * Путь вложения в чат: `{conversationId}/{uuid}.{ext}` — совпадает с ожидаемым публичным URL в Storage.
 */
export function buildMessengerChatObjectPath(conversationId: string, extension: string): string {
  const raw = String(conversationId || '').trim();
  const safeFolder = raw.replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
  const safeExt = messengerUploadExtension(extension);
  return `${safeFolder}/${randomUUID()}${safeExt}`;
}

/** Бакет `user-media`: аватары участников. */
export function buildUserMediaAvatarPath(memberId: number, extension: string): string {
  const ext = String(extension || '').trim();
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const id = randomUUID();
  return `avatars/${memberId}/${id}${safeExt}`;
}

/** Бакет `user-media`: изображения/видео постов профиля. */
export function buildUserMediaProfilePath(memberId: number, extension: string): string {
  const ext = String(extension || '').trim();
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const id = randomUUID();
  return `profile-media/${memberId}/${id}${safeExt}`;
}

/** Бакет `user-media`: афиши событий (админка). */
export function buildUserMediaEventPosterPath(extension: string): string {
  const ext = String(extension || '').trim();
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const id = randomUUID();
  return `event-posters/${id}${safeExt}`;
}
