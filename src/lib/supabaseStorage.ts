import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

let cached: SupabaseClient | null | undefined;

function getUrl(): string {
  return String(process.env.SUPABASE_URL ?? '').trim();
}

function getServiceRoleKey(): string {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
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
  return { publicUrl: data.publicUrl };
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
  return { signedUrl: data.signedUrl };
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
