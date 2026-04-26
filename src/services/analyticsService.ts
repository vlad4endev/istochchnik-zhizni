import crypto from 'node:crypto';
import Redis from 'ioredis';

import { pool } from '../config/db';

type Period = 'today' | '7d' | '30d' | '90d' | 'all';

type QueryValue = string | number | boolean | null;

type QueryRange = {
  whereSql: string;
  params: QueryValue[];
  nowRange: { from: Date | null; to: Date };
  prevRange: { from: Date | null; to: Date };
};

const CACHE_TTL_SECONDS = 300;
const ANALYTICS_CACHE_PREFIX = 'analytics:v1:';

let redisClient: Redis | null = null;
const memoryCache = new Map<string, { expiresAt: number; payload: string }>();
let cleanupTimer: NodeJS.Timeout | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on('error', (err) => {
      console.warn('[analytics] Redis cache error:', err instanceof Error ? err.message : String(err));
    });
    return redisClient;
  } catch (err) {
    console.warn('[analytics] Redis cache unavailable:', err);
    redisClient = null;
    return null;
  }
}

async function cacheGet<T>(key: string): Promise<T | null> {
  const fullKey = `${ANALYTICS_CACHE_PREFIX}${key}`;
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.connect();
    } catch {
      /* noop: fallback below */
    }
    try {
      const raw = await redis.get(fullKey);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  const fromMem = memoryCache.get(fullKey);
  if (!fromMem || fromMem.expiresAt < Date.now()) {
    memoryCache.delete(fullKey);
    return null;
  }
  return JSON.parse(fromMem.payload) as T;
}

async function cacheSet<T>(key: string, value: T): Promise<void> {
  const fullKey = `${ANALYTICS_CACHE_PREFIX}${key}`;
  const raw = JSON.stringify(value);
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(fullKey, raw, 'EX', CACHE_TTL_SECONDS);
      return;
    } catch {
      /* noop: fallback below */
    }
  }
  memoryCache.set(fullKey, {
    payload: raw,
    expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
  });
}

function normalizePeriod(raw: unknown): Period {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'today') return 'today';
  if (value === '7d') return '7d';
  if (value === '30d') return '30d';
  if (value === '90d') return '90d';
  return 'all';
}

function buildPeriodRange(period: Period): QueryRange {
  const now = new Date();
  if (period === 'all') {
    return {
      whereSql: '',
      params: [],
      nowRange: { from: null, to: now },
      prevRange: { from: null, to: now },
    };
  }
  const days = period === 'today' ? 1 : Number(period.replace('d', ''));
  const nowFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevFrom = new Date(nowFrom.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    whereSql: 'WHERE viewed_at >= $1',
    params: [nowFrom.toISOString()],
    nowRange: { from: nowFrom, to: now },
    prevRange: { from: prevFrom, to: nowFrom },
  };
}

function pageNameByKey(pageKey: string): string {
  const map: Record<string, string> = {
    dashboard: 'Главная',
    prayer: 'Молитва',
    messenger: 'Чаты',
    songbook: 'Песенник',
    studio: 'Студия',
    service_planner: 'Планировщик служений',
    profile: 'Профиль',
    admin: 'Админ',
    sermons: 'Проповеди',
    resources: 'Ресурсы',
  };
  return map[pageKey] ?? pageKey;
}

export function resolvePeriod(raw: unknown): Period {
  return normalizePeriod(raw);
}

export function hashIp(rawIp: string | null | undefined): string | null {
  const value = String(rawIp ?? '').trim();
  if (!value) return null;
  return crypto.createHash('sha256').update(value).digest('hex');
}

export async function trackFeatureEvent(input: {
  eventType: string;
  pageKey?: string | null;
  userId?: number | null;
  metadata?: unknown;
}): Promise<void> {
  if (!pool) return;
  const eventType = input.eventType.trim().slice(0, 100);
  if (!eventType) return;
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  await pool.query(
    `
      INSERT INTO feature_events (event_type, page_key, user_id, metadata)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [eventType, input.pageKey ?? null, input.userId ?? null, JSON.stringify(metadata)],
  );
}

export async function getOverview(periodRaw: unknown): Promise<unknown> {
  if (!pool) return {};
  const period = normalizePeriod(periodRaw);
  const cacheKey = `overview:${period}`;
  const cached = await cacheGet<unknown>(cacheKey);
  if (cached) return cached;

  const range = buildPeriodRange(period);
  const summarySql = `
    SELECT
      COUNT(*)::bigint AS total_views,
      COUNT(DISTINCT user_id)::bigint AS unique_users,
      COUNT(DISTINCT COALESCE(session_id, user_id::text))::bigint AS unique_sessions,
      COALESCE(AVG(duration_seconds)::numeric(12,2), 0::numeric) AS avg_session_duration
    FROM page_views
    ${range.whereSql}
  `;
  const topPagesSql = `
    SELECT
      page_key,
      COUNT(*)::bigint AS total_views,
      COUNT(DISTINCT user_id)::bigint AS unique_users
    FROM page_views
    ${range.whereSql}
    GROUP BY page_key
    ORDER BY total_views DESC
    LIMIT 10
  `;
  const byDaySql = `
    SELECT
      day::date AS day,
      SUM(total_views)::bigint AS views,
      SUM(unique_users)::bigint AS unique_users
    FROM analytics_page_daily_mv
    ${range.whereSql ? 'WHERE day >= $1::timestamptz' : ''}
    GROUP BY day::date
    ORDER BY day::date ASC
  `;
  const newVsReturningSql = `
    WITH first_seen AS (
      SELECT user_id, MIN(viewed_at) AS first_viewed_at
      FROM page_views
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ),
    scoped AS (
      SELECT pv.user_id, fs.first_viewed_at
      FROM page_views pv
      JOIN first_seen fs ON fs.user_id = pv.user_id
      ${range.whereSql}
      GROUP BY pv.user_id, fs.first_viewed_at
    )
    SELECT
      COUNT(*) FILTER (WHERE first_viewed_at >= $${range.params.length + 1})::bigint AS new_users,
      COUNT(*) FILTER (WHERE first_viewed_at <  $${range.params.length + 1})::bigint AS returning_users
    FROM scoped
  `;

  const startMarker = range.nowRange.from ?? new Date(0);
  const retentionSql = `
    WITH first_visit AS (
      SELECT user_id, MIN(viewed_at)::date AS first_day
      FROM page_views
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ),
    cohort AS (
      SELECT *
      FROM first_visit
      WHERE first_day >= $${range.params.length + 1}::date
        AND first_day <= $${range.params.length + 2}::date
    ),
    markers AS (
      SELECT 1::int AS day_n
      UNION ALL SELECT 7::int
      UNION ALL SELECT 30::int
    )
    SELECT
      m.day_n,
      COUNT(*)::bigint AS cohort_size,
      COUNT(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM page_views pv
          WHERE pv.user_id = c.user_id
            AND pv.viewed_at::date = c.first_day + m.day_n
        )
      )::bigint AS returned_users
    FROM cohort c
    CROSS JOIN markers m
    GROUP BY m.day_n
    ORDER BY m.day_n ASC
  `;

  const [summary, topPages, byDay, newVsReturning] = await Promise.all([
    pool.query(summarySql, range.params),
    pool.query(topPagesSql, range.params),
    pool.query(byDaySql, range.params),
    pool.query(newVsReturningSql, [...range.params, startMarker.toISOString()]),
  ]);

  let retentionRows: Array<{ day_n: unknown; cohort_size: unknown; returned_users: unknown }> = [];
  try {
    const retention = await pool.query(
      retentionSql,
      [
        ...range.params,
        (range.nowRange.from ?? new Date(0)).toISOString().slice(0, 10),
        range.nowRange.to.toISOString().slice(0, 10),
      ],
    );
    retentionRows = retention.rows;
  } catch (err) {
    console.error('Retention calculation failed:', err);
    retentionRows = [];
  }

  const result = {
    total_views: Number(summary.rows[0]?.total_views ?? 0),
    unique_users: Number(summary.rows[0]?.unique_users ?? 0),
    unique_sessions: Number(summary.rows[0]?.unique_sessions ?? 0),
    avg_session_duration: Number(summary.rows[0]?.avg_session_duration ?? 0),
    top_pages: topPages.rows.map((r) => ({
      page_key: r.page_key,
      page_name: pageNameByKey(String(r.page_key)),
      total_views: Number(r.total_views ?? 0),
      unique_users: Number(r.unique_users ?? 0),
    })),
    views_by_day: byDay.rows.map((r) => ({
      day: r.day,
      views: Number(r.views ?? 0),
      unique_users: Number(r.unique_users ?? 0),
    })),
    new_vs_returning: {
      new: Number(newVsReturning.rows[0]?.new_users ?? 0),
      returning: Number(newVsReturning.rows[0]?.returning_users ?? 0),
    },
    retention: retentionRows.map((r) => {
      const cohortSize = Number(r.cohort_size ?? 0);
      const returned = Number(r.returned_users ?? 0);
      return {
        day: Number(r.day_n ?? 0),
        cohort_size: cohortSize,
        returned_users: returned,
        returned_percent: cohortSize > 0 ? Number(((returned / cohortSize) * 100).toFixed(2)) : 0,
      };
    }),
  };

  await cacheSet(cacheKey, result);
  return result;
}

export async function getPagesStats(periodRaw: unknown): Promise<unknown[]> {
  if (!pool) return [];
  const period = normalizePeriod(periodRaw);
  const cacheKey = `pages:${period}`;
  const cached = await cacheGet<unknown[]>(cacheKey);
  if (cached) return cached;

  const range = buildPeriodRange(period);
  const currentSql = `
    SELECT
      page_key,
      COUNT(*)::bigint AS total_views,
      COUNT(DISTINCT user_id)::bigint AS unique_users,
      COALESCE(AVG(duration_seconds)::numeric(12,2), 0::numeric) AS avg_duration_seconds
    FROM page_views
    ${range.whereSql}
    GROUP BY page_key
  `;
  const prevSql = `
    SELECT page_key, COUNT(*)::bigint AS total_views
    FROM page_views
    WHERE viewed_at >= $1 AND viewed_at < $2
    GROUP BY page_key
  `;

  const [current, prev] = await Promise.all([
    pool.query(currentSql, range.params),
    range.nowRange.from
      ? pool.query(prevSql, [range.prevRange.from!.toISOString(), range.prevRange.to.toISOString()])
      : pool.query('SELECT NULL::text AS page_key, 0::bigint AS total_views WHERE false'),
  ]);

  const prevMap = new Map<string, number>();
  for (const row of prev.rows) {
    prevMap.set(String(row.page_key), Number(row.total_views ?? 0));
  }

  const out = current.rows
    .map((r) => {
      const pageKey = String(r.page_key);
      const prevViews = prevMap.get(pageKey) ?? 0;
      const totalViews = Number(r.total_views ?? 0);
      const trend = prevViews <= 0 ? (totalViews > 0 ? 100 : 0) : ((totalViews - prevViews) / prevViews) * 100;
      return {
        page_key: pageKey,
        page_name: pageNameByKey(pageKey),
        total_views: totalViews,
        unique_users: Number(r.unique_users ?? 0),
        avg_duration_seconds: Number(r.avg_duration_seconds ?? 0),
        views_trend: Number(trend.toFixed(2)),
      };
    })
    .sort((a, b) => b.total_views - a.total_views);

  await cacheSet(cacheKey, out);
  return out;
}

export async function getPageDetails(pageKey: string, periodRaw: unknown): Promise<unknown> {
  if (!pool) return {};
  const period = normalizePeriod(periodRaw);
  const range = buildPeriodRange(period);
  const whereSql = range.whereSql
    ? `${range.whereSql} AND page_key = $${range.params.length + 1}`
    : 'WHERE page_key = $1';
  const params = range.whereSql ? [...range.params, pageKey] : [pageKey];

  const [summary, byDay, byHour, heatmap, byDevice, byOs, viewers] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(*)::bigint AS total_views,
          COUNT(DISTINCT user_id)::bigint AS unique_users
        FROM page_views
        ${whereSql}
      `,
      params,
    ),
    pool.query(
      `
        SELECT day::date AS day, SUM(total_views)::bigint AS views
        FROM analytics_page_daily_mv
        WHERE page_key = $1
          ${range.nowRange.from ? 'AND day >= $2::timestamptz' : ''}
        GROUP BY day::date
        ORDER BY day::date ASC
      `,
      range.nowRange.from ? [pageKey, range.nowRange.from.toISOString()] : [pageKey],
    ),
    pool.query(
      `
        SELECT EXTRACT(HOUR FROM viewed_at)::int AS hour, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY 1
        ORDER BY 1
      `,
      params,
    ),
    pool.query(
      `
        SELECT day_of_week::int AS day_of_week, hour::int AS hour, views::bigint AS views
        FROM analytics_page_hourly_mv
        WHERE page_key = $1
        ORDER BY day_of_week ASC, hour ASC
      `,
      [pageKey],
    ),
    pool.query(
      `
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY 1
      `,
      params,
    ),
    pool.query(
      `
        SELECT COALESCE(os, 'unknown') AS os, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY 1
      `,
      params,
    ),
    pool.query(
      `
        SELECT
          pv.user_id,
          COALESCE(NULLIF(TRIM(m.name), ''), CONCAT_WS(' ', m.first_name, m.last_name), CONCAT('#', pv.user_id::text)) AS name,
          m.avatar_url AS avatar,
          m.app_role AS role,
          COUNT(*)::bigint AS views_count,
          MAX(pv.viewed_at) AS last_viewed_at,
          COALESCE(AVG(pv.duration_seconds)::numeric(12,2), 0::numeric) AS avg_duration_seconds,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT pv.device_type), NULL) AS devices
        FROM page_views pv
        LEFT JOIN members m ON m.id = pv.user_id
        ${whereSql}
          AND pv.user_id IS NOT NULL
        GROUP BY pv.user_id, m.name, m.first_name, m.last_name, m.avatar_url, m.app_role
        ORDER BY views_count DESC
        LIMIT 100
      `,
      params,
    ),
  ]);

  return {
    page_key: pageKey,
    page_name: pageNameByKey(pageKey),
    total_views: Number(summary.rows[0]?.total_views ?? 0),
    unique_users: Number(summary.rows[0]?.unique_users ?? 0),
    views_by_day: byDay.rows.map((r) => ({ day: r.day, views: Number(r.views ?? 0) })),
    views_by_hour: byHour.rows.map((r) => ({ hour: Number(r.hour ?? 0), views: Number(r.views ?? 0) })),
    views_heatmap: heatmap.rows.map((r) => ({
      day_of_week: Number(r.day_of_week ?? 0),
      hour: Number(r.hour ?? 0),
      views: Number(r.views ?? 0),
    })),
    views_by_device: Object.fromEntries(byDevice.rows.map((r) => [r.device_type, Number(r.views ?? 0)])),
    views_by_os: Object.fromEntries(byOs.rows.map((r) => [r.os, Number(r.views ?? 0)])),
    viewers: viewers.rows.map((r) => ({
      user_id: Number(r.user_id),
      name: r.name,
      avatar: r.avatar,
      role: r.role,
      views_count: Number(r.views_count ?? 0),
      last_viewed_at: r.last_viewed_at,
      avg_duration_seconds: Number(r.avg_duration_seconds ?? 0),
      devices: Array.isArray(r.devices) ? r.devices.filter(Boolean) : [],
    })),
  };
}

export async function getUserStats(userId: number, periodRaw: unknown): Promise<unknown> {
  if (!pool) return {};
  const period = normalizePeriod(periodRaw);
  const range = buildPeriodRange(period);
  const whereSql = range.whereSql
    ? `${range.whereSql} AND user_id = $${range.params.length + 1}`
    : 'WHERE user_id = $1';
  const params = range.whereSql ? [...range.params, userId] : [userId];

  const [userRow, summary, favoritePages, byDay, devices] = await Promise.all([
    pool.query(
      `
        SELECT id, name, first_name, last_name, avatar_url, app_role, created_at
        FROM members
        WHERE id = $1
      `,
      [userId],
    ),
    pool.query(
      `
        SELECT
          COUNT(*)::bigint AS total_views,
          COUNT(DISTINCT COALESCE(session_id, user_id::text))::bigint AS total_sessions,
          MIN(viewed_at) AS first_visit,
          MAX(viewed_at) AS last_visit
        FROM page_views
        ${whereSql}
      `,
      params,
    ),
    pool.query(
      `
        SELECT page_key, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY page_key
        ORDER BY views DESC
        LIMIT 5
      `,
      params,
    ),
    pool.query(
      `
        SELECT date_trunc('day', viewed_at)::date AS day, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      params,
    ),
    pool.query(
      `
        SELECT COALESCE(device_type, 'unknown') AS device_type, COUNT(*)::bigint AS views
        FROM page_views
        ${whereSql}
        GROUP BY 1
        ORDER BY views DESC
      `,
      params,
    ),
  ]);

  return {
    user: userRow.rows[0] ?? null,
    total_sessions: Number(summary.rows[0]?.total_sessions ?? 0),
    total_views: Number(summary.rows[0]?.total_views ?? 0),
    favorite_pages: favoritePages.rows.map((r) => ({
      page_key: r.page_key,
      page_name: pageNameByKey(String(r.page_key)),
      views: Number(r.views ?? 0),
    })),
    activity_by_day: byDay.rows.map((r) => ({ day: r.day, views: Number(r.views ?? 0) })),
    devices: devices.rows.map((r) => ({ device_type: r.device_type, views: Number(r.views ?? 0) })),
    first_visit: summary.rows[0]?.first_visit ?? null,
    last_visit: summary.rows[0]?.last_visit ?? null,
  };
}

export async function getTopUsers(input: {
  periodRaw: unknown;
  sortByRaw: unknown;
  pageKeyRaw: unknown;
}): Promise<unknown[]> {
  if (!pool) return [];
  const period = normalizePeriod(input.periodRaw);
  const sortBy = String(input.sortByRaw ?? 'total_views');
  const pageKey = typeof input.pageKeyRaw === 'string' && input.pageKeyRaw.trim() ? input.pageKeyRaw.trim() : null;
  const range = buildPeriodRange(period);

  const params: QueryValue[] = [...range.params];
  const clauses: string[] = [];
  if (range.whereSql) clauses.push('pv.viewed_at >= $1');
  if (pageKey) {
    params.push(pageKey);
    clauses.push(`pv.page_key = $${params.length}`);
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderSql =
    sortBy === 'sessions'
      ? 'total_sessions DESC, total_views DESC'
      : sortBy === 'last_active'
        ? 'last_active DESC, total_views DESC'
        : 'total_views DESC, total_sessions DESC';

  const sql = `
    SELECT
      m.id AS user_id,
      COALESCE(NULLIF(TRIM(m.name), ''), CONCAT_WS(' ', m.first_name, m.last_name), CONCAT('#', m.id::text)) AS name,
      m.avatar_url AS avatar,
      m.app_role AS role,
      COUNT(*)::bigint AS total_views,
      COUNT(DISTINCT COALESCE(pv.session_id, pv.user_id::text))::bigint AS total_sessions,
      MAX(pv.viewed_at) AS last_active,
      (
        SELECT pv2.page_key
        FROM page_views pv2
        WHERE pv2.user_id = m.id
        GROUP BY pv2.page_key
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS favorite_page
    FROM page_views pv
    JOIN members m ON m.id = pv.user_id
    ${whereSql}
    GROUP BY m.id, m.name, m.first_name, m.last_name, m.avatar_url, m.app_role
    ORDER BY ${orderSql}
    LIMIT 100
  `;
  const res = await pool.query(sql, params);
  return res.rows.map((r) => ({
    user_id: Number(r.user_id),
    name: r.name,
    avatar: r.avatar,
    role: r.role,
    total_views: Number(r.total_views ?? 0),
    sessions: Number(r.total_sessions ?? 0),
    last_active: r.last_active,
    favorite_page: r.favorite_page,
    favorite_page_name: r.favorite_page ? pageNameByKey(String(r.favorite_page)) : null,
  }));
}

export async function getRealtimeOnline(): Promise<unknown> {
  if (!pool) return { online_count: 0, users: [] };
  const result = await pool.query(
    `
      WITH latest AS (
        SELECT DISTINCT ON (COALESCE(user_id::text, session_id))
          user_id,
          session_id,
          page_key AS current_page,
          viewed_at
        FROM page_views
        WHERE viewed_at >= NOW() - INTERVAL '5 minutes'
        ORDER BY COALESCE(user_id::text, session_id), viewed_at DESC
      )
      SELECT
        l.user_id,
        COALESCE(NULLIF(TRIM(m.name), ''), CONCAT_WS(' ', m.first_name, m.last_name), 'Гость') AS name,
        m.avatar_url AS avatar,
        l.current_page,
        l.viewed_at AS online_since
      FROM latest l
      LEFT JOIN members m ON m.id = l.user_id
      ORDER BY l.viewed_at DESC
      LIMIT 100
    `,
  );
  return {
    online_count: result.rowCount ?? 0,
    users: result.rows.map((r) => ({
      user_id: r.user_id ? Number(r.user_id) : null,
      name: r.name,
      avatar: r.avatar,
      current_page: r.current_page,
      online_since: r.online_since,
    })),
  };
}

export async function refreshAnalyticsMaterializedViews(): Promise<void> {
  if (!pool) return;
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_page_daily_mv');
  await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_page_hourly_mv');
}

export async function cleanupOldAnalyticsData(): Promise<void> {
  if (!pool) return;
  await pool.query(`DELETE FROM page_views WHERE viewed_at < NOW() - INTERVAL '1 year'`);
}

export function startAnalyticsMaintenance(): void {
  if (cleanupTimer) return;
  void cleanupOldAnalyticsData().catch((err) => {
    console.warn('[analytics] initial cleanup failed:', err);
  });
  void refreshAnalyticsMaterializedViews().catch((err) => {
    console.warn('[analytics] materialized view refresh failed:', err);
  });
  cleanupTimer = setInterval(() => {
    void cleanupOldAnalyticsData().catch((err) => {
      console.warn('[analytics] scheduled cleanup failed:', err);
    });
    void refreshAnalyticsMaterializedViews().catch((err) => {
      console.warn('[analytics] scheduled MV refresh failed:', err);
    });
  }, 24 * 60 * 60 * 1000);
}

function escapeCsvValue(input: unknown): string {
  const raw = input == null ? '' : String(input);
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export async function exportAnalyticsCsv(periodRaw: unknown): Promise<string> {
  if (!pool) return 'viewed_at,page_key,page_url,user_id,session_id,device_type,os,browser,duration_seconds,referrer';
  const period = normalizePeriod(periodRaw);
  const range = buildPeriodRange(period);
  const rows = await pool.query(
    `
      SELECT
        viewed_at,
        page_key,
        page_url,
        user_id,
        session_id,
        device_type,
        os,
        browser,
        duration_seconds,
        referrer
      FROM page_views
      ${range.whereSql}
      ORDER BY viewed_at DESC
      LIMIT 100000
    `,
    range.params,
  );
  const headers = [
    'viewed_at',
    'page_key',
    'page_url',
    'user_id',
    'session_id',
    'device_type',
    'os',
    'browser',
    'duration_seconds',
    'referrer',
  ];
  const lines = [headers.join(',')];
  for (const row of rows.rows) {
    lines.push(
      headers
        .map((key) => escapeCsvValue((row as Record<string, unknown>)[key]))
        .join(','),
    );
  }
  return lines.join('\n');
}
