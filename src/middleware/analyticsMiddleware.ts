import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { UAParser } from 'ua-parser-js';

import { pool } from '../config/db';
import { hashIp } from '../services/analyticsService';

type AuthReq = Request & {
  authUserId?: number;
};

type QueuedPageView = {
  pageKey: string;
  pageUrl: string | null;
  userId: number | null;
  sessionId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  durationSeconds: number | null;
  viewedAt: Date;
};

const BATCH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 500;
const SESSION_COOKIE_NAME = 'analytics_session_id';
const REDIS_QUEUE_KEY = 'analytics:page_views:queue';

const ignoredPrefixes = [
  '/health',
  '/api/version',
  '/api/analytics',
  '/diagnostics',
  '/api/diagnostics',
  '/uploads',
  '/api/uploads',
  '/assets',
];

const botUaPattern =
  /(bot|crawl|spider|slurp|mediapartners-google|bingpreview|yandex|duckduckbot|baiduspider|facebookexternalhit)/i;

const queue: QueuedPageView[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let flushRunning = false;
let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;

function redisStatus(client: Redis): string {
  return String((client as unknown as { status?: string }).status ?? '');
}

async function getRedisClient(): Promise<Redis | null> {
  const redisUrl = String(process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) return null;
  if (!redisClient) {
    redisClient = new Redis(redisUrl, {
      connectionName: 'analytics-queue',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (retries) => (retries > 3 ? null : Math.min(300 * retries, 1500)),
    });
    redisClient.on('error', (err) => {
      console.warn('[analytics] Redis queue unavailable:', err instanceof Error ? err.message : String(err));
    });
  }
  if (redisStatus(redisClient) === 'ready') return redisClient;
  if (!redisConnectPromise) {
    redisConnectPromise = redisClient.connect().catch(() => undefined).finally(() => {
      redisConnectPromise = null;
    });
  }
  await redisConnectPromise;
  return redisStatus(redisClient) === 'ready' ? redisClient : null;
}

function analyticsEnabled(): boolean {
  return (process.env.ANALYTICS_ENABLED ?? 'true').toLowerCase() !== 'false';
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const raw = String(cookieHeader ?? '');
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (!k || rest.length === 0) continue;
    out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function getOrCreateSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[SESSION_COOKIE_NAME];
  if (existing && existing.length >= 24) return existing.slice(0, 64);
  const generated = crypto.randomBytes(32).toString('hex');
  const cookie = `${SESSION_COOKIE_NAME}=${generated}; Path=/; Max-Age=2592000; SameSite=Lax`;
  const prev = res.getHeader('Set-Cookie');
  if (!prev) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, cookie]);
  } else {
    res.setHeader('Set-Cookie', [String(prev), cookie]);
  }
  return generated;
}

function resolvePageKey(pathname: string): string {
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/prayer')) return 'prayer';
  if (pathname.startsWith('/messenger')) return 'messenger';
  if (pathname.startsWith('/songbook')) return 'songbook';
  if (pathname.startsWith('/studio')) return 'studio';
  if (pathname.startsWith('/service-planner') || pathname.startsWith('/service-plan')) return 'service_planner';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/sermons')) return 'sermons';
  if (pathname.startsWith('/resources')) return 'resources';
  return 'other';
}

function shouldSkip(req: Request): boolean {
  if (!analyticsEnabled()) return true;
  if (req.method !== 'GET') return true;
  const pathOnly = (req.originalUrl || req.url || req.path || '').split('?')[0] || '';
  if (pathOnly.startsWith('/api/')) return true;
  if (ignoredPrefixes.some((p) => pathOnly.startsWith(p))) return true;
  if (/\.(css|js|map|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf)$/i.test(pathOnly)) return true;
  const ua = req.get('user-agent') ?? '';
  if (botUaPattern.test(ua)) return true;
  return false;
}

function ensureTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushQueue();
  }, BATCH_INTERVAL_MS);
}

async function flushQueue(): Promise<void> {
  if (flushRunning || !pool) return;
  flushRunning = true;
  try {
    const redis = await getRedisClient();
    let batch: QueuedPageView[] = [];
    if (redis) {
      const rawItems = await redis.lrange(REDIS_QUEUE_KEY, 0, MAX_BATCH_SIZE - 1);
      if (rawItems.length > 0) {
        await redis.ltrim(REDIS_QUEUE_KEY, rawItems.length, -1);
        batch = rawItems
          .map((item) => {
            try {
              return JSON.parse(item) as QueuedPageView;
            } catch {
              return null;
            }
          })
          .filter((item): item is QueuedPageView => Boolean(item));
      }
    } else {
      batch = queue.splice(0, MAX_BATCH_SIZE);
    }
    if (batch.length === 0) return;
    const values: unknown[] = [];
    const rowsSql = batch
      .map((item, i) => {
        const p = i * 13;
        values.push(
          item.pageKey,
          item.pageUrl,
          item.userId,
          item.sessionId,
          item.ipHash,
          item.userAgent,
          item.deviceType,
          item.os,
          item.browser,
          item.referrer,
          item.durationSeconds,
          item.viewedAt.toISOString(),
        );
        return `($${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6}, $${p + 7}, $${p + 8}, $${p + 9}, $${p + 10}, $${p + 11}, $${p + 12})`;
      })
      .join(', ');
    await pool.query(
      `
        INSERT INTO page_views (
          page_key, page_url, user_id, session_id, ip_hash, user_agent, device_type, os, browser, referrer, duration_seconds, viewed_at
        )
        VALUES ${rowsSql}
      `,
      values,
    );
  } catch (err) {
    console.warn('[analytics] batch insert failed:', err);
  } finally {
    flushRunning = false;
    if (queue.length > 0) {
      setImmediate(() => {
        void flushQueue();
      });
    }
  }
}

export function enqueuePageView(item: QueuedPageView): void {
  if (!analyticsEnabled()) return;
  ensureTimer();
  void (async () => {
    const redis = await getRedisClient();
    if (redis) {
      await redis.rpush(REDIS_QUEUE_KEY, JSON.stringify(item));
      const size = await redis.llen(REDIS_QUEUE_KEY);
      if (size >= MAX_BATCH_SIZE) {
        void flushQueue();
      }
      return;
    }
    queue.push(item);
    if (queue.length >= MAX_BATCH_SIZE) {
      void flushQueue();
    }
  })().catch((err) => {
    console.warn('[analytics] enqueue failed, fallback to memory:', err);
    queue.push(item);
    if (queue.length >= MAX_BATCH_SIZE) {
      void flushQueue();
    }
  });
}

export function analyticsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (shouldSkip(req)) {
    next();
    return;
  }
  ensureTimer();
  const startedAt = Date.now();
  const parsedUrl = new URL(`${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl ?? req.url}`);
  const pageKey = resolvePageKey(parsedUrl.pathname);
  const ua = req.get('user-agent') ?? '';
  const parser = new UAParser(ua);
  const deviceType = parser.getDevice().type ?? 'desktop';
  const os = parser.getOS().name ?? 'unknown';
  const browser = parser.getBrowser().name ?? 'unknown';
  const authReq = req as AuthReq;
  const userId = authReq.authUserId ?? null;
  const sessionId = userId ? null : getOrCreateSessionId(req, res);
  const ipHash = hashIp(req.ip);
  const referrer = req.get('referer') ?? null;

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    enqueuePageView({
      pageKey,
      pageUrl: parsedUrl.toString(),
      userId,
      sessionId,
      ipHash,
      userAgent: ua || null,
      deviceType,
      os,
      browser,
      referrer,
      durationSeconds,
      viewedAt: new Date(),
    });
    if (pool) {
      void pool.query(
        `
          INSERT INTO analytics_sessions (id, user_id, device_type, os, browser, ip_hash, last_active_at, pages_visited)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), 1)
          ON CONFLICT (id) DO UPDATE
          SET
            user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id),
            device_type = COALESCE(EXCLUDED.device_type, analytics_sessions.device_type),
            os = COALESCE(EXCLUDED.os, analytics_sessions.os),
            browser = COALESCE(EXCLUDED.browser, analytics_sessions.browser),
            ip_hash = COALESCE(EXCLUDED.ip_hash, analytics_sessions.ip_hash),
            last_active_at = NOW(),
            pages_visited = analytics_sessions.pages_visited + 1
        `,
        [sessionId ?? `u-${userId}`, userId, deviceType, os, browser, ipHash],
      );
    }
  });
  next();
}
