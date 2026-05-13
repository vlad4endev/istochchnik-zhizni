import Redis from 'ioredis';

/**
 * Redis hot-path для auth при нескольких инстансах API:
 * — общий grace после refresh (две вкладки / повтор запроса);
 * — распределённый lock на refresh, чтобы не крутить Postgres параллельно;
 * — denylist access token hash после logout (короткий TTL), чтобы сократить окно гонок.
 *
 * Включается при непустом REDIS_URL и REDIS_AUTH_SESSION_ENABLED !== false
 * (независимо от REDIS_REALTIME_ENABLED).
 */
const KEY_PREFIX = 'ist:auth:';

let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;

function redisStatus(client: Redis): string {
  return String((client as unknown as { status?: string }).status ?? '');
}

export function isAuthSessionRedisConfigured(): boolean {
  const url = String(process.env.REDIS_URL ?? '').trim();
  if (!url) return false;
  if (String(process.env.REDIS_AUTH_SESSION_ENABLED ?? '').trim().toLowerCase() === 'false') {
    return false;
  }
  return true;
}

async function getRedisClient(): Promise<Redis | null> {
  if (!isAuthSessionRedisConfigured()) return null;
  if (!redisClient) {
    const redisUrl = String(process.env.REDIS_URL ?? '').trim();
    redisClient = new Redis(redisUrl, {
      connectionName: 'auth-session',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (retries) => (retries > 3 ? null : Math.min(300 * retries, 1500)),
    });
    redisClient.on('error', (err) => {
      console.warn(
        '[auth-session-redis] Redis error:',
        err instanceof Error ? err.message : String(err),
      );
    });
  }
  if (redisStatus(redisClient) === 'ready') {
    return redisClient;
  }
  if (!redisConnectPromise) {
    redisConnectPromise = redisClient
      .connect()
      .catch((err) => {
        console.warn(
          '[auth-session-redis] connect failed:',
          err instanceof Error ? err.message : String(err),
        );
        return undefined;
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }
  await redisConnectPromise;
  return redisStatus(redisClient) === 'ready' ? redisClient : null;
}

export type RefreshRotationRedisPayload = {
  token: string;
  expiresAt: string;
  refreshToken: string;
  refreshExpiresAt: string;
  memberId: number;
};

const REFRESH_GRACE_TTL_SEC = 65;
const REFRESH_LOCK_TTL_SEC = 15;

function refreshGraceKey(tokenHash: string): string {
  return `${KEY_PREFIX}rf_grace:${tokenHash}`;
}

function refreshLockKey(tokenHash: string): string {
  return `${KEY_PREFIX}rf_lock:${tokenHash}`;
}

function accessRevokedKey(accessTokenHash: string): string {
  return `${KEY_PREFIX}access_revoked:${accessTokenHash}`;
}

export async function takeRefreshRotationGraceFromRedis(
  refreshTokenHash: string,
): Promise<RefreshRotationRedisPayload | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(refreshGraceKey(refreshTokenHash));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RefreshRotationRedisPayload;
    if (
      typeof parsed?.token === 'string' &&
      typeof parsed?.expiresAt === 'string' &&
      typeof parsed?.refreshToken === 'string' &&
      typeof parsed?.refreshExpiresAt === 'string' &&
      typeof parsed?.memberId === 'number'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function rememberRefreshRotationGraceInRedis(
  refreshTokenHash: string,
  payload: RefreshRotationRedisPayload,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(refreshGraceKey(refreshTokenHash), REFRESH_GRACE_TTL_SEC, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** `null` — Redis недоступен, использовать in-memory очередь в authService. */
export async function tryAcquireRefreshRotationLock(
  refreshTokenHash: string,
): Promise<boolean | null> {
  const redis = await getRedisClient();
  if (!redis) return null;
  try {
    const r = await redis.set(refreshLockKey(refreshTokenHash), '1', 'EX', REFRESH_LOCK_TTL_SEC, 'NX');
    return r === 'OK';
  } catch {
    /* деградация: authService перейдёт на in-memory coalescing */
    return null;
  }
}

export async function releaseRefreshRotationLock(refreshTokenHash: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(refreshLockKey(refreshTokenHash));
  } catch {
    /* ignore */
  }
}

export async function isAccessTokenRevokedInRedis(accessTokenHash: string): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    const v = await redis.get(accessRevokedKey(accessTokenHash));
    return v != null && v !== '';
  } catch {
    return false;
  }
}

export async function markAccessTokenRevokedInRedis(
  accessTokenHash: string,
  ttlSeconds: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  const ttl = Math.max(1, Math.min(Math.ceil(ttlSeconds), 86400 * 2));
  try {
    await redis.setex(accessRevokedKey(accessTokenHash), ttl, '1');
  } catch {
    /* ignore */
  }
}

export async function isAuthSessionRedisReady(): Promise<boolean> {
  return (await getRedisClient()) != null;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
