import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

let cached: SupabaseClient | null | undefined;

function getUrl(): string {
  return String(process.env.SUPABASE_URL ?? '').trim();
}

function getServiceRoleKey(): string {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

/** Storage включён для серверной загрузки (service role). */
export function isSupabaseStorageConfigured(): boolean {
  return Boolean(getUrl() && getServiceRoleKey());
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
  return process.env.SUPABASE_STORAGE_BUCKET_MESSENGER?.trim() || 'chat';
}

export function userMediaBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET_USER_MEDIA?.trim() || 'user-media';
}

/**
 * Загружает файл с диска в Storage, возвращает публичный URL (бакет должен быть public).
 * Локальный файл после успешной загрузки можно удалить вызывающим кодом.
 */
export async function uploadLocalFileToPublicBucket(opts: {
  bucket: string;
  /** Ключ внутри бакета, без ведущего slash */
  objectPath: string;
  localPath: string;
  contentType?: string;
}): Promise<{ publicUrl: string }> {
  const client = getClient();
  if (!client) {
    throw new Error('Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  const buf = await fs.readFile(opts.localPath);
  const { error } = await client.storage
    .from(opts.bucket)
    .upload(opts.objectPath, buf, {
      contentType: opts.contentType,
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

export function buildMessengerObjectPath(memberId: number, originalName: string): string {
  const ext = path.extname(originalName || '') || '';
  const safeExt = ext && ext.length <= 12 ? ext.toLowerCase() : '';
  const id = randomUUID();
  return `${memberId}/${id}${safeExt}`;
}
