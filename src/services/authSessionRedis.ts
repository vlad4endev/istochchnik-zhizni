import Redis from 'ioredis';

/**
 * Redis hot-path для auth при нескольких инстансах API:
 * — общий grace после refresh (две вкладки / повтор запроса);
 * — распределённый lock на refresh, чтобы не крутить Postgres параллельно;
 * — denylist access token hash после logout (короткий TTL), чтобы сократить окно гонок.
 *
 * Включается при непустом REDIS_URL и REDIS_AUTH_SESSION_ENABLED !== false
 * (независимо от REDIS_REALTIME_ENABLED).
 *
 * Если Redis недоступен (нет контейнера / битый REDIS_URL), после ошибки включается
 * «охлаждение»: не ждём DNS/connect на каждом HTTP-запросе — иначе API «висит».
 */
const KEY_PREFIX = 'ist:auth:';
const CONNECT_TIMEOUT_MS = 2_000;
const UNAVAILABLE_COOLDOWN_MS = 60_000;

let redisClient: Redis | null = null;
let redisConnectPromise: Promise<void> | null = null;
/** До этого момента не пытаемся connect — Redis недавно был недоступен. */
let redisUnavailableUntilMs = 0;
let lastCooldownLogMs = 0;

function redisStatus(client: Redis): string {
  return String((client as unknown as { status?: string }).status ?? '');
}

function markRedisUnavailable(reason: string): void {
  redisUnavailableUntilMs = Date.now() + UNAVAILABLE_COOLDOWN_MS;
  const now = Date.now();
  if (now - lastCooldownLogMs >= UNAVAILABLE_COOLDOWN_MS) {
    lastCooldownLogMs = now;
    console.warn(
      `[auth-session-redis] Redis недоступен (${reason}). Пауза ${UNAVAILABLE_COOLDOWN_MS / 1000}с — ` +
        `auth идёт без Redis. Уберите REDIS_URL или поднимите redis / REDIS_AUTH_SESSION_ENABLED=false.`,
    );
  }
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch {
      /* ignore */
    }
    redisClient = null;
  }
  redisConnectPromise = null;
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
  if (Date.now() < redisUnavailableUntilMs) {
    return null;
  }
  if (!redisClient) {
    const redisUrl = String(process.env.REDIS_URL ?? '').trim();
    redisClient = new Redis(redisUrl, {
      connectionName: 'auth-session',
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: CONNECT_TIMEOUT_MS,
      retryStrategy: (retries) => (retries > 2 ? null : Math.min(200 * retries, 800)),
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
    const client = redisClient;
    redisConnectPromise = client
      .connect()
      .then(() => {
        if (redisStatus(client) !== 'ready') {
          markRedisUnavailable('connect finished but not ready');
        }
      })
      .catch((err) => {
        markRedisUnavailable(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        redisConnectPromise = null;
      });
  }
  await redisConnectPromise;
  return redisClient && redisStatus(redisClient) === 'ready' ? redisClient : null;
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
