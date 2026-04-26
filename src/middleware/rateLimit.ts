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
    redisConnectPromise = redisClient.connect().catch((err) => {
      console.warn('[rate-limit] Redis connect failed:', err instanceof Error ? err.message : String(err));
      return undefined;
    }).finally(() => {
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
    const redis = await getRedisClient();
    if (!redis) {
      // SECURITY FIX: без Redis не применяем in-memory fallback, чтобы не создавать ложное чувство защиты в multi-instance.
      next();
      return;
    }

    const key = `${keyPrefix}:${clientKey(req)}`;
    let count = 0;
    let pttl = 0;
    try {
      const result = await redis
        .multi()
        .incr(key)
        .pexpire(key, windowMs, 'NX')
        .pttl(key)
        .exec();
      count = Number(result?.[0]?.[1] ?? 0);
      pttl = Number(result?.[2]?.[1] ?? 0);
    } catch (err) {
      console.warn('[rate-limit] Redis command failed:', err instanceof Error ? err.message : String(err));
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

