import fs from 'node:fs';
import path from 'node:path';

import { pool, query } from '../config/db';
import { getAppReleasesDir, getUploadsRoot } from '../config/uploadsRoot';

let schemaReady = false;

/**
 * Self-heal: таблица могла не появиться, если деплой API обошёл initDb
 * (SKIP_DB_INIT_ON_START / Portainer). Без FK — у части ролей нет REFERENCES.
 */
export async function ensureAppReleasesSchema(): Promise<void> {
  if (schemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS app_releases (
      id BIGSERIAL PRIMARY KEY,
      version_name VARCHAR(64) NOT NULL DEFAULT '',
      version_code INTEGER,
      title VARCHAR(255) NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      download_url TEXT NOT NULL DEFAULT '',
      file_name VARCHAR(512),
      file_size_bytes BIGINT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_app_releases_active_created
      ON app_releases (is_active, created_at DESC)
  `);
  schemaReady = true;
}

export type AppRelease = {
  id: number;
  version_name: string;
  version_code: number | null;
  title: string;
  notes: string;
  download_url: string;
  file_name: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export type AppReleasePublic = {
  id: number;
  version_name: string;
  version_code: number | null;
  title: string;
  notes: string;
  download_url: string;
  file_name: string | null;
  file_size_bytes: number | null;
  created_at: string;
};

type ReleaseRow = {
  id: number | string;
  version_name: string | null;
  version_code: number | string | null;
  title: string | null;
  notes: string | null;
  download_url: string | null;
  file_name: string | null;
  file_size_bytes: number | string | null;
  is_active: boolean;
  created_by: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

function mapRow(row: ReleaseRow): AppRelease {
  return {
    id: Number(row.id),
    version_name: (row.version_name ?? '').trim(),
    version_code:
      row.version_code === null || row.version_code === undefined || row.version_code === ''
        ? null
        : Number(row.version_code),
    title: (row.title ?? '').trim(),
    notes: (row.notes ?? '').trim(),
    download_url: (row.download_url ?? '').trim(),
    file_name: row.file_name ? String(row.file_name) : null,
    file_size_bytes:
      row.file_size_bytes === null || row.file_size_bytes === undefined
        ? null
        : Number(row.file_size_bytes),
    is_active: Boolean(row.is_active),
    created_by: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function toPublic(r: AppRelease): AppReleasePublic {
  return {
    id: r.id,
    version_name: r.version_name,
    version_code: r.version_code,
    title: r.title,
    notes: r.notes,
    download_url: r.download_url,
    file_name: r.file_name,
    file_size_bytes: r.file_size_bytes,
    created_at: r.created_at,
  };
}

function requirePool() {
  if (!pool) throw new Error('Database pool is not initialized');
  return pool;
}

export function publicDownloadUrlForStoredFile(storedFileName: string): string {
  return `/uploads/releases/${encodeURIComponent(storedFileName)}`;
}

/** Absolute path if download_url points at a local releases file. */
export function resolveLocalReleaseFilePath(downloadUrl: string): string | null {
  const u = (downloadUrl || '').trim();
  const marker = '/uploads/releases/';
  const idx = u.indexOf(marker);
  if (idx < 0) return null;
  const rawName = decodeURIComponent(u.slice(idx + marker.length).split('?')[0] || '');
  if (!rawName || rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
    return null;
  }
  const abs = path.join(getAppReleasesDir(), rawName);
  const root = path.resolve(getAppReleasesDir());
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

function tryUnlinkLocalRelease(downloadUrl: string): void {
  const abs = resolveLocalReleaseFilePath(downloadUrl);
  if (!abs) return;
  try {
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('[releases] failed to delete local apk:', abs, e);
  }
}

export async function listAppReleases(): Promise<AppRelease[]> {
  await ensureAppReleasesSchema();
  const db = requirePool();
  const { rows } = await db.query<ReleaseRow>(
    `SELECT id, version_name, version_code, title, notes, download_url, file_name,
            file_size_bytes, is_active, created_by, created_at, updated_at
     FROM app_releases
     ORDER BY created_at DESC, id DESC`,
  );
  return rows.map(mapRow);
}

/** Latest active release that has a non-empty download URL. */
export async function getLatestActiveAppRelease(): Promise<AppReleasePublic | null> {
  await ensureAppReleasesSchema();
  const db = requirePool();
  const { rows } = await db.query<ReleaseRow>(
    `SELECT id, version_name, version_code, title, notes, download_url, file_name,
            file_size_bytes, is_active, created_by, created_at, updated_at
     FROM app_releases
     WHERE is_active = TRUE
       AND TRIM(COALESCE(download_url, '')) <> ''
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return toPublic(mapRow(row));
}

export type CreateAppReleaseInput = {
  version_name?: string;
  version_code?: number | null;
  title?: string;
  notes?: string;
  download_url?: string;
  file_name?: string | null;
  file_size_bytes?: number | null;
  is_active?: boolean;
  created_by?: number | null;
};

export async function createAppRelease(input: CreateAppReleaseInput): Promise<AppRelease> {
  await ensureAppReleasesSchema();
  const db = requirePool();
  const downloadUrl = (input.download_url ?? '').trim();
  if (!downloadUrl) {
    throw new Error('download_url_required');
  }
  const { rows } = await db.query<ReleaseRow>(
    `INSERT INTO app_releases (
       version_name, version_code, title, notes, download_url,
       file_name, file_size_bytes, is_active, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, version_name, version_code, title, notes, download_url, file_name,
               file_size_bytes, is_active, created_by, created_at, updated_at`,
    [
      (input.version_name ?? '').trim().slice(0, 64),
      input.version_code ?? null,
      (input.title ?? '').trim().slice(0, 255),
      (input.notes ?? '').trim(),
      downloadUrl,
      input.file_name ?? null,
      input.file_size_bytes ?? null,
      input.is_active !== false,
      input.created_by ?? null,
    ],
  );
  return mapRow(rows[0]!);
}

export type PatchAppReleaseInput = {
  version_name?: string;
  version_code?: number | null;
  title?: string;
  notes?: string;
  download_url?: string;
  file_name?: string | null;
  file_size_bytes?: number | null;
  is_active?: boolean;
};

export async function patchAppRelease(id: number, input: PatchAppReleaseInput): Promise<AppRelease> {
  await ensureAppReleasesSchema();
  const db = requirePool();
  const { rows: existingRows } = await db.query<ReleaseRow>(
    `SELECT id, version_name, version_code, title, notes, download_url, file_name,
            file_size_bytes, is_active, created_by, created_at, updated_at
     FROM app_releases WHERE id = $1`,
    [id],
  );
  const existing = existingRows[0];
  if (!existing) throw new Error('release_not_found');

  const nextUrl =
    input.download_url !== undefined ? input.download_url.trim() : (existing.download_url ?? '').trim();
  if (!nextUrl && input.is_active !== false && (input.is_active === true || existing.is_active)) {
    // Allow deactivating without URL, but not leaving an active empty link when replacing.
  }

  const { rows } = await db.query<ReleaseRow>(
    `UPDATE app_releases SET
       version_name = COALESCE($2, version_name),
       version_code = CASE WHEN $3::boolean THEN $4 ELSE version_code END,
       title = COALESCE($5, title),
       notes = COALESCE($6, notes),
       download_url = COALESCE($7, download_url),
       file_name = CASE WHEN $8::boolean THEN $9 ELSE file_name END,
       file_size_bytes = CASE WHEN $10::boolean THEN $11 ELSE file_size_bytes END,
       is_active = COALESCE($12, is_active),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, version_name, version_code, title, notes, download_url, file_name,
               file_size_bytes, is_active, created_by, created_at, updated_at`,
    [
      id,
      input.version_name !== undefined ? input.version_name.trim().slice(0, 64) : null,
      input.version_code !== undefined,
      input.version_code !== undefined ? input.version_code : null,
      input.title !== undefined ? input.title.trim().slice(0, 255) : null,
      input.notes !== undefined ? input.notes.trim() : null,
      input.download_url !== undefined ? input.download_url.trim() : null,
      input.file_name !== undefined,
      input.file_name !== undefined ? input.file_name : null,
      input.file_size_bytes !== undefined,
      input.file_size_bytes !== undefined ? input.file_size_bytes : null,
      input.is_active !== undefined ? input.is_active : null,
    ],
  );

  const updated = mapRow(rows[0]!);
  // If URL changed away from old local file, delete orphan.
  if (
    input.download_url !== undefined &&
    (existing.download_url ?? '').trim() !== updated.download_url
  ) {
    tryUnlinkLocalRelease((existing.download_url ?? '').trim());
  }
  return updated;
}

export async function deleteAppRelease(id: number): Promise<void> {
  await ensureAppReleasesSchema();
  const db = requirePool();
  const { rows } = await db.query<ReleaseRow>(
    `DELETE FROM app_releases WHERE id = $1
     RETURNING id, version_name, version_code, title, notes, download_url, file_name,
               file_size_bytes, is_active, created_by, created_at, updated_at`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('release_not_found');
  tryUnlinkLocalRelease((row.download_url ?? '').trim());
}

/** Ensure uploads root exists (side-effect import for static serving). */
export function ensureReleasesUploadDir(): void {
  try {
    fs.mkdirSync(path.join(getUploadsRoot(), 'releases'), { recursive: true });
  } catch {
    /* ignore */
  }
}
