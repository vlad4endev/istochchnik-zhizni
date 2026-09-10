import type { Request, Response } from 'express';
import path from 'node:path';

import {
  createAppRelease,
  deleteAppRelease,
  getLatestActiveAppRelease,
  listAppReleases,
  patchAppRelease,
  publicDownloadUrlForStoredFile,
} from '../services/appReleasesService';

type AuthRequest = Request & {
  authUserId?: number;
  authUserRole?: string;
  authUserRoles?: string[];
  file?: Express.Multer.File;
};

function ensureAdmin(req: Request, res: Response): AuthRequest | null {
  const r = req as AuthRequest;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход в аккаунт' });
    return null;
  }
  const roles = Array.isArray(r.authUserRoles) ? r.authUserRoles : [];
  if (r.authUserRole !== 'admin' && !roles.includes('admin')) {
    res.status(403).json({ error: 'Только администратор имеет доступ' });
    return null;
  }
  return r;
}

function parseOptionalInt(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function parseBool(raw: unknown, fallback?: boolean): boolean | undefined {
  if (raw === undefined) return fallback;
  if (typeof raw === 'boolean') return raw;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

function mapError(error: unknown): { status: number; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'download_url_required') {
    return { status: 400, error: 'Укажите ссылку на APK или загрузите файл' };
  }
  if (msg === 'release_not_found') {
    return { status: 404, error: 'Релиз не найден' };
  }
  return { status: 500, error: 'Не удалось выполнить операцию с релизом' };
}

/** GET /api/releases/latest — публичный (для виджета на главной). */
export async function getLatestReleaseHandler(_req: Request, res: Response): Promise<void> {
  try {
    const latest = await getLatestActiveAppRelease();
    res.json({ release: latest });
  } catch (e) {
    console.error('[releases] latest', e);
    res.status(500).json({ error: 'Не удалось загрузить релиз' });
  }
}

/** GET /api/releases — список для админки. */
export async function listReleasesHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  try {
    const items = await listAppReleases();
    res.json({ items });
  } catch (e) {
    console.error('[releases] list', e);
    res.status(500).json({ error: 'Не удалось загрузить список релизов' });
  }
}

/** POST /api/releases — создать (JSON или multipart с полем apk). */
export async function createReleaseHandler(req: Request, res: Response): Promise<void> {
  const auth = ensureAdmin(req, res);
  if (!auth) return;
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const file = (req as AuthRequest).file;
    let downloadUrl = typeof body.download_url === 'string' ? body.download_url.trim() : '';
    let fileName: string | null = null;
    let fileSize: number | null = null;

    if (file) {
      const stored = path.basename(file.filename);
      downloadUrl = publicDownloadUrlForStoredFile(stored);
      fileName = file.originalname || stored;
      fileSize = typeof file.size === 'number' ? file.size : null;
    }

    if (!downloadUrl) {
      res.status(400).json({ error: 'Укажите ссылку на APK или загрузите файл' });
      return;
    }

    const versionCode = parseOptionalInt(body.version_code);
    const item = await createAppRelease({
      version_name: typeof body.version_name === 'string' ? body.version_name : '',
      version_code: versionCode === undefined ? null : versionCode,
      title: typeof body.title === 'string' ? body.title : '',
      notes: typeof body.notes === 'string' ? body.notes : '',
      download_url: downloadUrl,
      file_name: fileName,
      file_size_bytes: fileSize,
      is_active: parseBool(body.is_active, true),
      created_by: auth.authUserId ?? null,
    });
    res.status(201).json({ item });
  } catch (e) {
    console.error('[releases] create', e);
    const mapped = mapError(e);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

/** PATCH /api/releases/:id */
export async function patchReleaseHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id релиза' });
    return;
  }
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const file = (req as AuthRequest).file;
    const patch: Parameters<typeof patchAppRelease>[1] = {};

    if (typeof body.version_name === 'string') patch.version_name = body.version_name;
    if (body.version_code !== undefined) {
      const vc = parseOptionalInt(body.version_code);
      if (vc === undefined) {
        res.status(400).json({ error: 'Некорректный version_code' });
        return;
      }
      patch.version_code = vc;
    }
    if (typeof body.title === 'string') patch.title = body.title;
    if (typeof body.notes === 'string') patch.notes = body.notes;
    if (body.is_active !== undefined) {
      const b = parseBool(body.is_active);
      if (b === undefined) {
        res.status(400).json({ error: 'Некорректный is_active' });
        return;
      }
      patch.is_active = b;
    }

    if (file) {
      const stored = path.basename(file.filename);
      patch.download_url = publicDownloadUrlForStoredFile(stored);
      patch.file_name = file.originalname || stored;
      patch.file_size_bytes = typeof file.size === 'number' ? file.size : null;
    } else if (typeof body.download_url === 'string') {
      patch.download_url = body.download_url.trim();
      if (patch.download_url && !patch.download_url.includes('/uploads/releases/')) {
        patch.file_name = null;
        patch.file_size_bytes = null;
      }
    }

    const item = await patchAppRelease(id, patch);
    res.json({ item });
  } catch (e) {
    console.error('[releases] patch', e);
    const mapped = mapError(e);
    res.status(mapped.status).json({ error: mapped.error });
  }
}

/** DELETE /api/releases/:id */
export async function deleteReleaseHandler(req: Request, res: Response): Promise<void> {
  if (!ensureAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный id релиза' });
    return;
  }
  try {
    await deleteAppRelease(id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[releases] delete', e);
    const mapped = mapError(e);
    res.status(mapped.status).json({ error: mapped.error });
  }
}
