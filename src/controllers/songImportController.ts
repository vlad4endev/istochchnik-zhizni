import type { Request, Response } from 'express';
import multer from 'multer';

import { canModerateCatalog, normalizeAppRole, type AppRole } from '../types/appRole';
import { query } from '../config/db';
import { importSongsFromXlsxRows } from '../import/importManager';
import { parseXlsxBuffer } from '../import/xlsxParser';
import type { ImportProgress, ImportResult, ParsedXlsxSong } from '../import/types';

type AuthReq = Request & { authUserId?: number; authUserRole?: AppRole };

function roleOf(req: AuthReq): AppRole {
  return normalizeAppRole(req.authUserRole);
}

function ensureCatalogModerator(req: Request, res: Response): { ok: true; userId: number } | { ok: false } {
  const r = req as AuthReq;
  if (!r.authUserId) {
    res.status(401).json({ error: 'Требуется вход' });
    return { ok: false };
  }
  if (!canModerateCatalog(roleOf(r))) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return { ok: false };
  }
  return { ok: true, userId: r.authUserId };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

export const songImportUploadXlsx = upload.single('file');

type JobState = {
  createdAt: number;
  total: number;
  done: boolean;
  result: ImportResult | null;
  progress: ImportProgress | null;
  log: Array<{ ts: number; kind: 'info' | 'error' | 'done'; message: string }>;
  listeners: Set<(p: { event: string; data: unknown }) => void>;
};

const JOB_TTL_MS = 30 * 60 * 1000;
const jobs = new Map<string, JobState>();

function newJobId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `job_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function cleanupJobs(): void {
  const now = Date.now();
  for (const [id, st] of jobs.entries()) {
    if (now - st.createdAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

function emit(job: JobState, event: string, data: unknown) {
  for (const fn of job.listeners) {
    try {
      fn({ event, data });
    } catch {
      // ignore
    }
  }
}

export async function previewSongImportXlsx(req: Request, res: Response): Promise<void> {
  if (!ensureCatalogModerator(req, res).ok) return;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer || file.buffer.length === 0) {
    res.status(400).json({ error: 'xlsx file required (field: file)' });
    return;
  }
  const parsed = parseXlsxBuffer(Buffer.from(file.buffer), { previewLimit: 5 });
  res.json({
    totalRows: parsed.totalRows,
    parsedSongs: parsed.songs.length,
    preview: parsed.preview,
    errors: parsed.errors,
  });
}

export async function startSongImportXlsx(req: Request, res: Response): Promise<void> {
  const auth = ensureCatalogModerator(req, res);
  if (!auth.ok) return;
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file?.buffer || file.buffer.length === 0) {
    res.status(400).json({ error: 'xlsx file required (field: file)' });
    return;
  }

  cleanupJobs();

  const parsed = parseXlsxBuffer(Buffer.from(file.buffer), { previewLimit: 0 });
  if (parsed.errors.length > 0) {
    res.status(422).json({ error: 'Файл содержит ошибки. Сначала исправьте их.', errors: parsed.errors });
    return;
  }

  const jobId = newJobId();
  const job: JobState = {
    createdAt: Date.now(),
    total: parsed.songs.length,
    done: false,
    result: null,
    progress: null,
    log: [],
    listeners: new Set(),
  };
  jobs.set(jobId, job);

  // fire-and-forget job
  void (async () => {
    try {
      const result = await importSongsFromXlsxRows(parsed.songs, {
        createdByMemberId: auth.userId,
        requestDelayMs: 1500,
        onProgress: (p) => {
          job.progress = p;
          if (p.status === 'error') {
            job.log.push({ ts: Date.now(), kind: 'error', message: `${p.song_title}: ${p.message ?? 'error'}` });
          } else if (p.status === 'done') {
            job.log.push({ ts: Date.now(), kind: 'info', message: `✓ ${p.song_title}` });
          } else if (p.status === 'fetching') {
            job.log.push({ ts: Date.now(), kind: 'info', message: `… ${p.song_title}: загрузка` });
          }
          emit(job, 'progress', p);
        },
      });
      job.done = true;
      job.result = result;
      job.log.push({ ts: Date.now(), kind: 'done', message: 'Импорт завершён' });
      emit(job, 'done', result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      job.done = true;
      job.result = { success: 0, failed: job.total, skipped: 0, errors: [{ song_number: 0, title: '', error: msg }] };
      job.log.push({ ts: Date.now(), kind: 'error', message: `Импорт упал: ${msg}` });
      emit(job, 'done', job.result);
    }
  })();

  res.json({ jobId, total: parsed.songs.length });
}

export async function songImportProgressSse(req: Request, res: Response): Promise<void> {
  if (!ensureCatalogModerator(req, res).ok) return;
  const jobId = String(req.params.jobId ?? '').trim();
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // initial snapshot
  send('snapshot', { total: job.total, done: job.done, progress: job.progress, result: job.result, log: job.log.slice(-100) });
  if (job.done && job.result) {
    send('done', job.result);
    res.end();
    return;
  }

  const listener = (p: { event: string; data: unknown }) => send(p.event, p.data);
  job.listeners.add(listener);

  req.on('close', () => {
    job.listeners.delete(listener);
  });
}

export async function songImportProgressSnapshot(req: Request, res: Response): Promise<void> {
  if (!ensureCatalogModerator(req, res).ok) return;
  const jobId = String(req.params.jobId ?? '').trim();
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }
  res.json({
    total: job.total,
    done: job.done,
    progress: job.progress,
    result: job.result,
    log: job.log.slice(-200),
  });
}

export async function retryFailedSongImports(req: Request, res: Response): Promise<void> {
  const auth = ensureCatalogModerator(req, res);
  if (!auth.ok) return;

  const r = await query(
    `SELECT external_id, song_number, title, table_of_contents, url_lyrics, url_chords, url_youtube
     FROM songs
     WHERE needs_retry = TRUE
       AND external_id IS NOT NULL
       AND url_lyrics IS NOT NULL
       AND url_chords IS NOT NULL
     ORDER BY COALESCE(song_number, 2147483647) ASC, title ASC`,
  );
  const songs: ParsedXlsxSong[] = (r.rows as Record<string, unknown>[]).map((row) => ({
    external_id: String(row.external_id ?? ''),
    song_number: Number(row.song_number ?? 0),
    title: String(row.title ?? ''),
    table_of_contents: String(row.table_of_contents ?? ''),
    url_lyrics: String(row.url_lyrics ?? ''),
    url_chords: String(row.url_chords ?? ''),
    url_youtube: row.url_youtube != null && String(row.url_youtube).trim() ? String(row.url_youtube) : null,
  })).filter((s) => s.external_id && s.song_number > 0 && s.title);

  if (songs.length === 0) {
    res.json({ ok: true, total: 0, message: 'Нет песен для повтора' });
    return;
  }

  cleanupJobs();
  const jobId = newJobId();
  const job: JobState = {
    createdAt: Date.now(),
    total: songs.length,
    done: false,
    result: null,
    progress: null,
    log: [],
    listeners: new Set(),
  };
  jobs.set(jobId, job);

  void (async () => {
    const result = await importSongsFromXlsxRows(songs, {
      createdByMemberId: auth.userId,
      requestDelayMs: 1500,
      onProgress: (p) => {
        job.progress = p;
        emit(job, 'progress', p);
      },
    });
    job.done = true;
    job.result = result;
    emit(job, 'done', result);
  })();

  res.json({ jobId, total: songs.length });
}

