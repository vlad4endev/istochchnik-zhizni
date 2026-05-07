import type { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';

type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyPrefix?: string;
};

let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;

/** In-memory buckets: только один процесс Node; при нескольких репликах API лимит не общий (в отличие от Redis). */
type MemoryBucket = { count: number; expiresAt: number };
const memoryBuckets = new Map<string, MemoryBucket>();

let memoryPruneTimer: ReturnType<typeof setInterval> | null = null;

function ensureMemoryPruneScheduled(): void {
  if (memoryPruneTimer) return;
  memoryPruneTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of memoryBuckets) {
      if (now >= v.expiresAt) {
        memoryBuckets.delete(k);
      }
    }
  }, 5 * 60_000);
  memoryPruneTimer.unref?.();
}

/**
 * Фиксированное окно windowMs, семантика близка к INCR + PTTL в Redis-ветке.
 */
function checkMemoryRateLimit(
  fullKey: string,
  windowMs: number,
  maxRequests: number,
): { ok: boolean; retryAfterSec: number } {
  ensureMemoryPruneScheduled();
  const now = Date.now();
  const entry = memoryBuckets.get(fullKey);
  if (!entry || now >= entry.expiresAt) {
    memoryBuckets.set(fullKey, { count: 1, expiresAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count <= maxRequests) {
    return { ok: true, retryAfterSec: 0 };
  }
  const retryAfterSec = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
  return { ok: false, retryAfterSec };
}

let lastInMemoryFallbackWarnMs = 0;
const IN_MEMORY_WARN_INTERVAL_MS = 30_000;

function warnInMemoryFallback(reason: string): void {
  const now = Date.now();
  if (now - lastInMemoryFallbackWarnMs < IN_MEMORY_WARN_INTERVAL_MS) {
    return;
  }
  lastInMemoryFallbackWarnMs = now;
  console.warn(
    `[rate-limit] In-memory rate limit (${reason}). Counters are not shared across API instances; restart clears them.`,
  );
}

function redisStatus(client: Redis): string {
  return String((client as unknown as { status?: string }).status ?? '');
}

function clientKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${ip}:${req.method}:${req.path}`;
}

function isRedisEnabled(): boolean {
  const url = String(process.env.REDIS_URL ?? '').trim();
  if (!url) return false;
  if (process.env.REDIS_REALTIME_ENABLED === 'false') return false;
  return true;
}

async function getRedisClient(): Promise<Redis | null> {
  if (!isRedisEnabled()) return null;
  if (!redisClient) {
    const redisUrl = String(process.env.REDIS_URL ?? '').trim();
    redisClient = new Redis(redisUrl, {
      connectionName: 'http-rate-limit',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (retries) => (retries > 3 ? null : Math.min(300 * retries, 1500)),
    });
    redisClient.on('error', (err) => {
      console.warn('[rate-limit] Redis unavailable:', err instanceof Error ? err.message : String(err));
    });
  }
  if (redisStatus(redisClient) === 'ready') {
    return redisClient;
  }
  if (!redisConnectPromise) {
    redisConnectPromise = redisClient
      .connect()
      .catch((err) => {
        console.warn('[rate-limit] Redis connect failed:', err instanceof Error ? err.message : String(err));
        return undefined;
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }
  await redisConnectPromise;
  return redisStatus(redisClient) === 'ready' ? redisClient : null;
}

export function createIpRateLimiter(options: RateLimitOptions) {
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const message = options.message ?? 'Too many requests';
  const keyPrefix = options.keyPrefix ?? 'rate-limit';

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const fullKey = `${keyPrefix}:${clientKey(req)}`;
    const redis = await getRedisClient();
    if (!redis) {
      warnInMemoryFallback('Redis unavailable or not configured');
      const mem = checkMemoryRateLimit(fullKey, windowMs, maxRequests);
      if (!mem.ok) {
        res.setHeader('Retry-After', String(mem.retryAfterSec));
        res.status(429).json({ error: message });
        return;
      }
      next();
      return;
    }

    let count = 0;
    let pttl = 0;
    try {
      const result = await redis
        .multi()
        .incr(fullKey)
        .pexpire(fullKey, windowMs, 'NX')
        .pttl(fullKey)
        .exec();
      count = Number(result?.[0]?.[1] ?? 0);
      pttl = Number(result?.[2]?.[1] ?? 0);
    } catch (err) {
      console.warn('[rate-limit] Redis command failed:', err instanceof Error ? err.message : String(err));
      warnInMemoryFallback('Redis command error');
      const mem = checkMemoryRateLimit(fullKey, windowMs, maxRequests);
      if (!mem.ok) {
        res.setHeader('Retry-After', String(mem.retryAfterSec));
        res.status(429).json({ error: message });
        return;
      }
      next();
      return;
    }

    if (count <= maxRequests) {
      next();
      return;
    }

    const retryAfterSec = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    res.status(429).json({ error: message });
  };
}
