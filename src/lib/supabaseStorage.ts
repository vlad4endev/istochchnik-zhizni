import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
    if (parsed.pathname.includes('/storage/v1/')) {
      const pub = new URL(publicOrigin.includes('://') ? publicOrigin : `https://${publicOrigin}`);
      parsed.protocol = pub.protocol;
      parsed.host = pub.host;
      return parsed.toString();
    }
  } catch {
    /* ignore */
  }
  return url;
}

/** Поля вложений мессенджера / медиа, где может лежать абсолютный URL Storage. */
export function rewriteStorageUrlsInRecord(pl: Record<string, unknown>): Record<string, unknown> {
  if (!pl || typeof pl !== 'object' || Array.isArray(pl)) return pl;
  const out: Record<string, unknown> = { ...pl };
  for (const key of ['url', 'signedUrl', 'signed_url', 'thumbnail_url', 'preview_url'] as const) {
    const v = out[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = rewriteSupabaseStorageUrlForClient(v);
    }
  }
  return out;
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

export function messengerBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_MESSENGER?.trim() || 'messenger';
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
}): Promise<{ publicUrl: string }> {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  const { error } = await client.storage
    .from(opts.bucket)
    .upload(opts.objectPath, opts.file, {
      contentType: opts.contentType,
      cacheControl: opts.cacheControl,
      metadata: opts.metadata,
      upsert: false,
    });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
  const { data } = client.storage.from(opts.bucket).getPublicUrl(opts.objectPath);
  if (!data?.publicUrl) {
    throw new Error('Storage getPublicUrl returned empty URL');
  }
  return { publicUrl: rewriteSupabaseStorageUrlForClient(data.publicUrl) };
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

export function buildMessengerObjectPath(memberId: number, extension: string): string {
  const ext = String(extension || '').trim();
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const id = randomUUID();
  return `${memberId}/${id}${safeExt}`;
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
