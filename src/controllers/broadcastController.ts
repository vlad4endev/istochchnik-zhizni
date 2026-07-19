import type { Request, Response } from 'express';
import { pool } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import {
  BROADCAST_STARTS_AT_SELECT,
  normalizeBroadcastStartsAtForDb,
} from '../utils/broadcastStartsAt';

type BroadcastStatus = 'scheduled' | 'live' | 'finished';
type BroadcastPlatform = 'youtube' | 'rutube' | 'vk' | 'other';

type BroadcastPayload = {
  title?: unknown;
  description?: unknown;
  starts_at?: unknown;
  platform?: unknown;
  stream_url?: unknown;
  notify_members?: unknown;
  is_public?: unknown;
  status?: unknown;
};

function normalizeText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const x = v.trim();
  return x.length > 0 ? x : null;
}

function normalizeBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  return fallback;
}

function normalizeStatus(v: unknown, fallback: BroadcastStatus): BroadcastStatus {
  const n = String(v ?? '').trim().toLowerCase();
  if (n === 'scheduled' || n === 'live' || n === 'finished') return n;
  return fallback;
}

function normalizePlatform(v: unknown, fallback: BroadcastPlatform): BroadcastPlatform {
  const n = String(v ?? '').trim().toLowerCase();
  if (n === 'youtube' || n === 'rutube' || n === 'vk' || n === 'other') return n;
  return fallback;
}

/** Длительность слота эфира — совпадает с фронтом (BROADCAST_SLOT_MS = 2 ч). */
const BROADCAST_SLOT_INTERVAL = `INTERVAL '2 hours'`;

/**
 * Помечает эфиры со статусом live/scheduled как finished, если слот уже закончился.
 * Нужно, чтобы история записей заполнялась без ручного PATCH.
 */
async function expireElapsedBroadcasts(): Promise<void> {
  if (!pool) return;
  await pool.query(
    `UPDATE broadcasts
        SET status = 'finished',
            updated_at = NOW()
      WHERE status IN ('live', 'scheduled')
        AND starts_at IS NOT NULL
        AND starts_at + ${BROADCAST_SLOT_INTERVAL} < NOW()`,
  );
}

async function ensureBroadcastSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS broadcasts (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(255),
      description TEXT,
      starts_at TIMESTAMP,
      source_service_plan_id BIGINT,
      platform VARCHAR(20) NOT NULL DEFAULT 'youtube',
      stream_url TEXT,
      notify_members BOOLEAN NOT NULL DEFAULT TRUE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
      notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS title VARCHAR(255);`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS description TEXT;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS source_service_plan_id BIGINT;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'youtube';`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS stream_url TEXT;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS notify_members BOOLEAN DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'scheduled';`);
  await pool.query(`ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN DEFAULT FALSE;`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcasts_source_service_plan_id
      ON broadcasts (source_service_plan_id)
      WHERE source_service_plan_id IS NOT NULL;`,
  );
}

export async function getActiveBroadcast(_req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    await expireElapsedBroadcasts();
    const { rows } = await pool.query(
      `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent
         FROM broadcasts
        WHERE status IN ('live', 'scheduled')
          AND (status = 'live' OR starts_at IS NULL OR starts_at >= (NOW() - INTERVAL '6 hours'))
        ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, starts_at ASC NULLS LAST, id DESC
        LIMIT 1`,
    );
    res.json({ broadcast: rows[0] ?? null });
  } catch (error) {
    console.error('getActiveBroadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/** История завершённых трансляций с записью — доступна участникам церкви. */
export async function getBroadcastHistory(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    await expireElapsedBroadcasts();
    const rawLimit = Number(req.query.limit ?? 30);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 30;
    const { rows } = await pool.query(
      `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent
         FROM broadcasts
        WHERE status = 'finished'
          AND stream_url IS NOT NULL
          AND TRIM(stream_url) <> ''
        ORDER BY starts_at DESC NULLS LAST, id DESC
        LIMIT $1`,
      [limit],
    );
    res.json({ items: rows });
  } catch (error) {
    console.error('getBroadcastHistory error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listBroadcasts(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    const status = String(req.query.status ?? '').trim().toLowerCase();
    const rawLimit = Number(req.query.limit ?? 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 10;
    if (status) {
      const { rows } = await pool.query(
        `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent
           FROM broadcasts
          WHERE status = $1
          ORDER BY starts_at DESC NULLS LAST, id DESC
          LIMIT $2`,
        [status, limit],
      );
      res.json({ items: rows });
      return;
    }
    const { rows } = await pool.query(
      `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent
         FROM broadcasts
        ORDER BY starts_at DESC NULLS LAST, id DESC
        LIMIT $1`,
      [limit],
    );
    res.json({ items: rows });
  } catch (error) {
    console.error('listBroadcasts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createBroadcast(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    const body = (req.body ?? {}) as BroadcastPayload;
    const title = normalizeText(body.title);
    const description = normalizeText(body.description);
    const startsAt = normalizeBroadcastStartsAtForDb(body.starts_at);
    const streamUrl = normalizeText(body.stream_url);
    const platform = normalizePlatform(body.platform, 'youtube');
    const notifyMembers = normalizeBool(body.notify_members, true);
    const isPublic = normalizeBool(body.is_public, false);
    const status = normalizeStatus(body.status, 'scheduled');
    const { rows } = await pool.query(
      `INSERT INTO broadcasts (title, description, starts_at, platform, stream_url, notify_members, is_public, status)
       VALUES ($1, $2, $3::timestamp, $4, $5, $6, $7, $8)
       RETURNING id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent`,
      [title, description, startsAt, platform, streamUrl, notifyMembers, isPublic, status],
    );
    notifyRealtime(['broadcast']);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('createBroadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function patchBroadcast(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    const broadcastId = Number(req.params.id);
    if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
      res.status(400).json({ error: 'Invalid broadcast id' });
      return;
    }
    const currentResult = await pool.query(
      `SELECT id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent
         FROM broadcasts
        WHERE id = $1
        LIMIT 1`,
      [broadcastId],
    );
    if (currentResult.rowCount === 0) {
      res.status(404).json({ error: 'Broadcast not found' });
      return;
    }
    const current = currentResult.rows[0];
    const body = (req.body ?? {}) as BroadcastPayload;
    const title = body.title === undefined ? current.title : normalizeText(body.title);
    const description = body.description === undefined ? current.description : normalizeText(body.description);
    const startsAt =
      body.starts_at === undefined ? current.starts_at : normalizeBroadcastStartsAtForDb(body.starts_at);
    const streamUrl = body.stream_url === undefined ? current.stream_url : normalizeText(body.stream_url);
    const platform = body.platform === undefined ? current.platform : normalizePlatform(body.platform, current.platform);
    const notifyMembers = body.notify_members === undefined ? Boolean(current.notify_members) : normalizeBool(body.notify_members, Boolean(current.notify_members));
    const isPublic = body.is_public === undefined ? Boolean(current.is_public) : normalizeBool(body.is_public, Boolean(current.is_public));
    const status = body.status === undefined ? current.status : normalizeStatus(body.status, current.status);

    const { rows } = await pool.query(
      `UPDATE broadcasts
          SET title = $1,
              description = $2,
              starts_at = $3::timestamp,
              platform = $4,
              stream_url = $5,
              notify_members = $6,
              is_public = $7,
              status = $8,
              updated_at = NOW()
        WHERE id = $9
      RETURNING id, title, description, ${BROADCAST_STARTS_AT_SELECT}, platform, stream_url, notify_members, is_public, status, notification_sent`,
      [title, description, startsAt, platform, streamUrl, notifyMembers, isPublic, status, broadcastId],
    );
    notifyRealtime(['broadcast']);
    res.json(rows[0]);
  } catch (error) {
    console.error('patchBroadcast error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getBroadcastEmbed(_req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    const { rows } = await pool.query(
      `SELECT stream_url
         FROM broadcasts
        WHERE status IN ('live', 'scheduled')
        ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, starts_at ASC NULLS LAST, id DESC
        LIMIT 1`,
    );
    res.json({ rutube_embed_code: rows[0]?.stream_url ?? null });
  } catch (error) {
    console.error('getBroadcastEmbed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateBroadcastEmbed(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    await ensureBroadcastSchema();
    const streamUrl = normalizeText((req.body ?? {}).rutube_embed_code);
    const activeResult = await pool.query(
      `SELECT id
         FROM broadcasts
        WHERE status IN ('live', 'scheduled')
        ORDER BY CASE WHEN status = 'live' THEN 0 ELSE 1 END, starts_at ASC NULLS LAST, id DESC
        LIMIT 1`,
    );
    if (activeResult.rowCount === 0) {
      await pool.query(
        `INSERT INTO broadcasts (title, stream_url, status, platform)
         VALUES ('Трансляция', $1, 'scheduled', $2)`,
        [streamUrl, normalizePlatform(streamUrl, 'other')],
      );
    } else {
      await pool.query(`UPDATE broadcasts SET stream_url = $1, updated_at = NOW() WHERE id = $2`, [
        streamUrl,
        activeResult.rows[0].id,
      ]);
    }
    notifyRealtime(['broadcast']);
    res.json({ rutube_embed_code: streamUrl });
  } catch (error) {
    console.error('updateBroadcastEmbed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
