import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Redis from 'ioredis';
import { pool } from '../../config/db';
import { getFirebaseMessaging } from '../../config/firebaseAdmin';
import { getUploadsRoot } from '../../config/uploadsRoot';
import {
  isSupabaseStorageConfigured,
  shouldWarnMissingSupabaseStoragePublicUrl,
} from '../../lib/supabaseStorage';
import { getRealtimeWsStats } from '../../realtime/wsHub';
import { resolveLlmRuntimeConfig } from '../../services/aiSettingsService';
import { isBackupBusy, listBackups } from '../../services/backupService';
import { loadBackupSettingsDocument } from '../../services/backupSettingsService';
import { probeLiveKitRoomService, resolveLiveKitRoutingMode } from '../../services/livekitService';
import { resolveSmsRuntimeConfig } from '../../services/smsSettingsService';
import { getActiveTelegramProxyStatus, getTelegramSettings } from '../../services/telegramService';
import { getVapidConfig } from '../../services/vapidKeys';
import type { MonitorCheckResult, SubsystemInventory, SubsystemItem } from '../types';
import {
  getCronJobHeartbeats,
  getErrorRateWindow,
  getEventLoopStats,
  getMetricsSnapshot,
  readSystemMemoryInfo,
} from './metrics';
import { getCachedMonitorSettings } from './settings';

const execFileAsync = promisify(execFile);

/**
 * Атомарные проверки здоровья вотчдога и глубокий аудит всех подсистем платформы.
 * Все внешние проверки имеют жёсткие таймауты, чтобы мониторинг никогда не вешал API.
 */

const DB_TIMEOUT_MS = 5000;
const REDIS_TIMEOUT_MS = 2500;
const SUPABASE_TIMEOUT_MS = 5000;
const LIVEKIT_TIMEOUT_MS = 4000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Таймаут проверки (${ms} ms)`)), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function checkDatabase(): Promise<MonitorCheckResult> {
  const started = Date.now();
  const th = getCachedMonitorSettings().thresholds;
  if (!pool) {
    return {
      id: 'database',
      label: 'PostgreSQL',
      category: 'core',
      status: 'fail',
      severity: 'critical',
      optional: false,
      details: 'DATABASE_URL не задан — база данных не подключена',
      durationMs: 0,
    };
  }
  try {
    const res = await withTimeout(
      pool.query<{ active: string; total: string; max_conn: string }>(
        `SELECT
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::text AS active,
          (SELECT count(*) FROM pg_stat_activity)::text AS total,
          current_setting('max_connections') AS max_conn`,
      ),
      DB_TIMEOUT_MS,
    );
    const durationMs = Date.now() - started;
    const row = res.rows[0];
    const totalConns = Number(row?.total ?? 0);
    const maxConns = Math.max(1, Number(row?.max_conn ?? 100));
    const connPct = Number(((totalConns / maxConns) * 100).toFixed(1));
    const waiting = pool.waitingCount;

    let status: MonitorCheckResult['status'] = 'ok';
    if (connPct >= 92 || waiting >= 5) status = 'fail';
    else if (durationMs > th.dbLatencyWarnMs || connPct >= 75 || waiting > 0) status = 'warn';

    return {
      id: 'database',
      label: 'PostgreSQL',
      category: 'core',
      status,
      severity: 'critical',
      optional: false,
      details: `${durationMs} ms · соед. ${totalConns}/${maxConns} (${connPct}%) · пул ${pool.totalCount}/${pool.idleCount} idle${waiting > 0 ? ` · ожидание ${waiting}` : ''}`,
      value: durationMs,
      durationMs,
      threshold: { warn: th.dbLatencyWarnMs, fail: DB_TIMEOUT_MS, unit: 'ms' },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'database',
      label: 'PostgreSQL',
      category: 'core',
      status: 'fail',
      severity: 'critical',
      optional: false,
      details: `БД недоступна: ${message}`,
      durationMs: Date.now() - started,
    };
  }
}

async function readDiskInfo(): Promise<{ usagePercent: number; availableGb: number; totalGb: number; mountPoint: string } | null> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '.']);
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const parts = lines[1]!.split(/\s+/);
    if (parts.length < 6) return null;
    const totalKb = Number(parts[1]) || 0;
    const availKb = Number(parts[3]) || 0;
    const usagePercent = Number(String(parts[4]).replace('%', ''));
    if (!Number.isFinite(usagePercent)) return null;
    return {
      usagePercent,
      availableGb: Number((availKb / 1024 / 1024).toFixed(2)),
      totalGb: Number((totalKb / 1024 / 1024).toFixed(2)),
      mountPoint: parts[5] ?? '/',
    };
  } catch {
    return null;
  }
}

async function checkDirWritable(dir: string): Promise<{ writable: boolean; error?: string }> {
  const probe = path.join(dir, `.diag-write-probe-${process.pid}-${Date.now()}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.unlink(probe);
    return { writable: true };
  } catch (error) {
    return { writable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function checkDisk(): Promise<MonitorCheckResult> {
  const started = Date.now();
  const th = getCachedMonitorSettings().thresholds;
  const info = await readDiskInfo();
  const durationMs = Date.now() - started;
  if (!info) {
    return {
      id: 'disk',
      label: 'Диск и файловая система',
      category: 'resources',
      status: 'skip',
      severity: 'warning',
      optional: true,
      details: 'df недоступен в этом окружении',
      durationMs,
    };
  }
  const status =
    info.usagePercent >= th.diskFailPercent
      ? 'fail'
      : info.usagePercent >= th.diskWarnPercent
        ? 'warn'
        : 'ok';
  return {
    id: 'disk',
    label: 'Диск и файловая система',
    category: 'resources',
    status,
    severity: 'critical',
    optional: false,
    details: `Занято ${info.usagePercent.toFixed(1)}% · свободно ${info.availableGb} GB из ${info.totalGb} GB (${info.mountPoint})`,
    value: info.usagePercent,
    durationMs,
    threshold: { warn: th.diskWarnPercent, fail: th.diskFailPercent, unit: '%' },
  };
}

export async function checkRedis(): Promise<MonitorCheckResult> {
  const started = Date.now();
  const redisUrl = String(process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) {
    return {
      id: 'redis',
      label: 'Redis',
      category: 'integrations',
      status: 'skip',
      severity: 'warning',
      optional: true,
      details: 'REDIS_URL не задан — опциональная интеграция отключена',
      durationMs: 0,
    };
  }
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: REDIS_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await withTimeout(client.connect(), REDIS_TIMEOUT_MS);
    const pong = await withTimeout(client.ping(), REDIS_TIMEOUT_MS);
    const durationMs = Date.now() - started;
    return {
      id: 'redis',
      label: 'Redis',
      category: 'integrations',
      status: pong === 'PONG' ? 'ok' : 'fail',
      severity: 'warning',
      optional: true,
      details: `PING/PONG за ${durationMs} ms`,
      value: durationMs,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'redis',
      label: 'Redis',
      category: 'integrations',
      status: 'fail',
      severity: 'warning',
      optional: true,
      details: `Недоступен: ${message}`,
      durationMs: Date.now() - started,
    };
  } finally {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

export async function checkSupabase(): Promise<MonitorCheckResult> {
  const started = Date.now();
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!isSupabaseStorageConfigured() || !url || !serviceRole) {
    return {
      id: 'supabase',
      label: 'Supabase Storage',
      category: 'integrations',
      status: 'skip',
      severity: 'warning',
      optional: true,
      details: 'SUPABASE_URL/KEY не заданы — облачное хранилище отключено',
      durationMs: 0,
    };
  }
  try {
    const response = await withTimeout(
      fetch(`${url.replace(/\/+$/, '')}/rest/v1/`, {
        method: 'GET',
        headers: { apikey: serviceRole, Authorization: `Bearer ${serviceRole}` },
      }),
      SUPABASE_TIMEOUT_MS,
    );
    const durationMs = Date.now() - started;
    const ok = response.status < 500;
    const publicUrlWarn = shouldWarnMissingSupabaseStoragePublicUrl();
    return {
      id: 'supabase',
      label: 'Supabase Storage',
      category: 'integrations',
      status: !ok ? 'fail' : publicUrlWarn ? 'warn' : 'ok',
      severity: 'warning',
      optional: true,
      details: `HTTP ${response.status} за ${durationMs} ms${publicUrlWarn ? ' · не задан SUPABASE_STORAGE_PUBLIC_URL' : ''}`,
      value: durationMs,
      durationMs,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'supabase',
      label: 'Supabase Storage',
      category: 'integrations',
      status: 'fail',
      severity: 'warning',
      optional: true,
      details: `Недоступен: ${message}`,
      durationMs: Date.now() - started,
    };
  }
}

export async function checkLiveKit(): Promise<MonitorCheckResult> {
  const started = Date.now();
  try {
    const probe = await withTimeout(probeLiveKitRoomService(), LIVEKIT_TIMEOUT_MS);
    const durationMs = Date.now() - started;
    if (!probe.configured) {
      return {
        id: 'livekit',
        label: 'LiveKit (звонки)',
        category: 'integrations',
        status: 'skip',
        severity: 'warning',
        optional: true,
        details: 'LiveKit не настроен — модуль звонков отключён',
        durationMs,
      };
    }
    return {
      id: 'livekit',
      label: 'LiveKit (звонки)',
      category: 'integrations',
      status: probe.ok ? 'ok' : 'fail',
      severity: 'warning',
      optional: true,
      details: probe.ok
        ? `Room Service отвечает за ${durationMs} ms (${probe.url ?? 'internal'})`
        : `Недоступен: ${probe.error ?? 'нет ответа'}`,
      value: durationMs,
      durationMs,
    };
  } catch (error) {
    return {
      id: 'livekit',
      label: 'LiveKit (звонки)',
      category: 'integrations',
      status: 'fail',
      severity: 'warning',
      optional: true,
      details: `Ошибка проверки: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - started,
    };
  }
}

export async function checkTelegramHealth(): Promise<MonitorCheckResult> {
  const started = Date.now();
  if (!pool) {
    return {
      id: 'telegram',
      label: 'Telegram Bot',
      category: 'integrations',
      status: 'skip',
      severity: 'warning',
      optional: true,
      details: 'БД не подключена',
      durationMs: 0,
    };
  }
  try {
    const tg = await getTelegramSettings();
    if (!tg.enabled) {
      return {
        id: 'telegram',
        label: 'Telegram Bot',
        category: 'integrations',
        status: 'skip',
        severity: 'warning',
        optional: true,
        details: 'Интеграция Telegram выключена в настройках',
        durationMs: Date.now() - started,
      };
    }
    if (!tg.has_bot_token) {
      return {
        id: 'telegram',
        label: 'Telegram Bot',
        category: 'integrations',
        status: 'warn',
        severity: 'warning',
        optional: true,
        details: 'Telegram включён, но токен бота не задан',
        durationMs: Date.now() - started,
      };
    }
    let failed24h = 0;
    let total24h = 0;
    try {
      const { rows } = await pool.query<{ total: string; failed: string }>(
        `SELECT COUNT(*)::text AS total,
                COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
           FROM telegram_send_logs
          WHERE created_at >= NOW() - INTERVAL '24 hours'`,
      );
      total24h = Number(rows[0]?.total ?? 0);
      failed24h = Number(rows[0]?.failed ?? 0);
    } catch {
      // таблица может ещё не быть создана
    }
    const failRate = total24h >= 5 ? (failed24h / total24h) * 100 : 0;
    const status: MonitorCheckResult['status'] =
      failRate >= 50 ? 'fail' : failed24h >= 5 && failRate >= 20 ? 'warn' : 'ok';
    return {
      id: 'telegram',
      label: 'Telegram Bot',
      category: 'integrations',
      status,
      severity: 'warning',
      optional: true,
      details:
        total24h > 0
          ? `Токен активен · за 24ч отправок: ${total24h}, ошибок: ${failed24h}`
          : 'Токен активен · отправок за 24ч не было',
      value: failed24h,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      id: 'telegram',
      label: 'Telegram Bot',
      category: 'integrations',
      status: 'warn',
      severity: 'warning',
      optional: true,
      details: `Не удалось проверить: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - started,
    };
  }
}

export function checkEventLoop(): MonitorCheckResult {
  const th = getCachedMonitorSettings().thresholds;
  const { lagMs, maxLagMs, p95LagMs } = getEventLoopStats();
  const status =
    lagMs >= th.eventLoopFailMs ? 'fail' : lagMs >= th.eventLoopWarnMs ? 'warn' : 'ok';
  return {
    id: 'event_loop',
    label: 'Event loop lag',
    category: 'resources',
    status,
    severity: 'critical',
    optional: false,
    details: `Средний ${lagMs} ms · p95 ${p95LagMs} ms · макс ${maxLagMs} ms`,
    value: lagMs,
    durationMs: 0,
    threshold: { warn: th.eventLoopWarnMs, fail: th.eventLoopFailMs, unit: 'ms' },
  };
}

export function checkProcessMemory(): MonitorCheckResult {
  const th = getCachedMonitorSettings().thresholds;
  const metrics = getMetricsSnapshot();
  const pct = metrics.memory.usagePercent;
  const status = pct >= th.heapFailPercent ? 'fail' : pct >= th.heapWarnPercent ? 'warn' : 'ok';
  const heapMb = (metrics.memory.heapUsedBytes / 1024 / 1024).toFixed(0);
  const limitMb = (metrics.memory.heapLimitBytes / 1024 / 1024).toFixed(0);
  const rssMb = (metrics.memory.rssBytes / 1024 / 1024).toFixed(0);
  return {
    id: 'process_memory',
    label: 'Память Node.js (V8 Heap)',
    category: 'resources',
    status,
    severity: 'critical',
    optional: false,
    details: `Heap ${heapMb}/${limitMb} MB (${pct}%) · RSS ${rssMb} MB`,
    value: pct,
    durationMs: 0,
    threshold: { warn: th.heapWarnPercent, fail: th.heapFailPercent, unit: '%' },
  };
}

export function checkSystemMemory(): MonitorCheckResult {
  const th = getCachedMonitorSettings().thresholds;
  const sys = readSystemMemoryInfo();
  const status =
    sys.usagePercent >= th.systemMemFailPercent
      ? 'fail'
      : sys.usagePercent >= th.systemMemWarnPercent
        ? 'warn'
        : 'ok';
  const availGb = (sys.availableBytes / 1024 / 1024 / 1024).toFixed(2);
  const totalGb = (sys.totalBytes / 1024 / 1024 / 1024).toFixed(2);
  return {
    id: 'system_memory',
    label: 'Память сервера (RAM)',
    category: 'resources',
    status,
    severity: 'critical',
    optional: false,
    details: `Занято ${sys.usagePercent.toFixed(1)}% · доступно ${availGb} / ${totalGb} GB`,
    value: sys.usagePercent,
    durationMs: 0,
    threshold: { warn: th.systemMemWarnPercent, fail: th.systemMemFailPercent, unit: '%' },
  };
}

export function checkCpuLoad(): MonitorCheckResult {
  const cores = Math.max(1, os.cpus().length);
  const load1 = os.loadavg()[0] ?? 0;
  const loadPerCore = Number((load1 / cores).toFixed(2));
  const status = loadPerCore >= 2.5 ? 'fail' : loadPerCore >= 1.2 ? 'warn' : 'ok';
  return {
    id: 'cpu_load',
    label: 'Нагрузка CPU (Load Avg)',
    category: 'resources',
    status,
    severity: 'warning',
    optional: false,
    details: `1m load ${load1.toFixed(2)} на ${cores} ядрах (${loadPerCore} / ядро)`,
    value: loadPerCore,
    durationMs: 0,
    threshold: { warn: 1.2, fail: 2.5, unit: 'load/core' },
  };
}

export function checkErrorRate(): MonitorCheckResult {
  const th = getCachedMonitorSettings().thresholds;
  const win = getErrorRateWindow(th.errorRateWindowMin);
  if (win.total < 5) {
    return {
      id: 'error_rate',
      label: `Доля ошибок 5xx (${th.errorRateWindowMin} мин)`,
      category: 'traffic',
      status: 'ok',
      severity: 'critical',
      optional: false,
      details:
        win.errors5xx > 0
          ? `Ошибок 5xx: ${win.errors5xx} (трафик ${win.total} запр., мало данных для %)`
          : `Мало трафика для % (${win.total} запр., 0 ошибок 5xx)`,
      value: 0,
      durationMs: 0,
      threshold: { warn: th.errorRateWarnPercent, fail: th.errorRateFailPercent, unit: '%' },
    };
  }
  const status =
    win.errorRatePercent >= th.errorRateFailPercent
      ? 'fail'
      : win.errorRatePercent >= th.errorRateWarnPercent
        ? 'warn'
        : 'ok';
  return {
    id: 'error_rate',
    label: `Доля ошибок 5xx (${th.errorRateWindowMin} мин)`,
    category: 'traffic',
    status,
    severity: 'critical',
    optional: false,
    details: `${win.errors5xx} из ${win.total} запросов = ${win.errorRatePercent}%`,
    value: win.errorRatePercent,
    durationMs: 0,
    threshold: { warn: th.errorRateWarnPercent, fail: th.errorRateFailPercent, unit: '%' },
  };
}

export function checkLatency(): MonitorCheckResult {
  const th = getCachedMonitorSettings().thresholds;
  const metrics = getMetricsSnapshot();
  const p95 = metrics.requests.latency.p95Ms;
  const status =
    p95 >= th.latencyP95FailMs ? 'fail' : p95 >= th.latencyP95WarnMs ? 'warn' : 'ok';
  return {
    id: 'latency_p95',
    label: 'Латентность API (p95)',
    category: 'traffic',
    status,
    severity: 'critical',
    optional: false,
    details: `p95 = ${p95} ms · p99 = ${metrics.requests.latency.p99Ms} ms · avg = ${metrics.requests.latency.avgMs} ms`,
    value: p95,
    durationMs: 0,
    threshold: { warn: th.latencyP95WarnMs, fail: th.latencyP95FailMs, unit: 'ms' },
  };
}

export function checkCriticalEnv(): MonitorCheckResult {
  const missing = ['NODE_ENV', 'PORT', 'DATABASE_URL'].filter(
    (key) => !String(process.env[key] ?? '').trim(),
  );
  return {
    id: 'critical_env',
    label: 'Критичные переменные окружения',
    category: 'security',
    status: missing.length === 0 ? 'ok' : 'fail',
    severity: 'critical',
    optional: false,
    details:
      missing.length === 0 ? 'NODE_ENV, PORT, DATABASE_URL заданы' : `Отсутствуют: ${missing.join(', ')}`,
    durationMs: 0,
  };
}

/** Полный набор проверок вотчдога. Параллельный, быстрый, с таймаутами. */
export async function runMonitorChecks(): Promise<MonitorCheckResult[]> {
  const [database, disk, redis, supabase, livekit, telegram] = await Promise.all([
    checkDatabase(),
    checkDisk(),
    checkRedis(),
    checkSupabase(),
    checkLiveKit(),
    checkTelegramHealth(),
  ]);
  return [
    database,
    checkErrorRate(),
    checkLatency(),
    checkEventLoop(),
    checkProcessMemory(),
    checkSystemMemory(),
    checkCpuLoad(),
    disk,
    redis,
    supabase,
    livekit,
    telegram,
    checkCriticalEnv(),
  ];
}

// ─── Глубокая инвентаризация всех подсистем платформы ────────────────────

async function inspectPostgresSubsystem(): Promise<SubsystemItem> {
  const t0 = Date.now();
  if (!pool) {
    return {
      id: 'postgres',
      name: 'PostgreSQL',
      status: 'fail',
      configured: false,
      summary: 'DATABASE_URL не задан',
      metrics: { connected: false },
      warnings: ['Задайте DATABASE_URL в окружении сервера'],
    };
  }
  try {
    const [statRes, tablesRes, locksRes] = await Promise.all([
      withTimeout(
        pool.query<{
          db_size_mb: string;
          active_conns: string;
          idle_conns: string;
          total_conns: string;
          max_conns: string;
          long_queries: string;
          version: string;
        }>(`
          SELECT
            ROUND(pg_database_size(current_database()) / 1024.0 / 1024.0, 2)::text AS db_size_mb,
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::text AS active_conns,
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle')::text AS idle_conns,
            (SELECT count(*) FROM pg_stat_activity)::text AS total_conns,
            current_setting('max_connections') AS max_conns,
            (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND NOW() - query_start > INTERVAL '5 seconds')::text AS long_queries,
            split_part(version(), ' ', 2) AS version
        `),
        DB_TIMEOUT_MS,
      ),
      withTimeout(
        pool.query<{ relname: string; rows: string }>(`
          SELECT relname, COALESCE(n_live_tup, 0)::text AS rows
            FROM pg_stat_user_tables
           WHERE relname IN (
             'members', 'prayer_cycles', 'calendar_events', 'songs',
             'service_plans', 'app_logs', 'push_subscriptions', 'global_settings',
             'messenger_conversations', 'messenger_messages'
           )
        `),
        DB_TIMEOUT_MS,
      ),
      withTimeout(
        pool.query<{ blocked: string }>(
          `SELECT count(*)::text AS blocked FROM pg_locks WHERE NOT granted`,
        ),
        DB_TIMEOUT_MS,
      ),
    ]);

    const latencyMs = Date.now() - t0;
    const s = statRes.rows[0];
    const totalConns = Number(s?.total_conns ?? 0);
    const maxConns = Math.max(1, Number(s?.max_conns ?? 100));
    const longQueries = Number(s?.long_queries ?? 0);
    const blockedLocks = Number(locksRes.rows[0]?.blocked ?? 0);
    const tableMap = new Map(tablesRes.rows.map((r) => [r.relname, Number(r.rows)]));

    const warnings: string[] = [];
    if (totalConns / maxConns >= 0.8) warnings.push(`Высокая загрузка соединений: ${totalConns}/${maxConns}`);
    if (longQueries > 0) warnings.push(`Долгих запросов (>5с): ${longQueries}`);
    if (blockedLocks > 0) warnings.push(`Заблокированных локов: ${blockedLocks}`);
    if (pool.waitingCount > 0) warnings.push(`Очередь ожидания в pg-пуле: ${pool.waitingCount}`);

    const criticalTables = ['members', 'global_settings', 'app_logs'];
    const missingTables = criticalTables.filter((t) => !tableMap.has(t));
    if (missingTables.length > 0) warnings.push(`Отсутствуют таблицы: ${missingTables.join(', ')}`);

    const status: SubsystemItem['status'] =
      missingTables.length > 0 || blockedLocks >= 5 || totalConns / maxConns >= 0.92
        ? 'fail'
        : warnings.length > 0
          ? 'warn'
          : 'ok';

    return {
      id: 'postgres',
      name: 'PostgreSQL',
      status,
      configured: true,
      latencyMs,
      summary: `PG ${s?.version ?? ''} · ${s?.db_size_mb ?? '0'} MB · соед. ${totalConns}/${maxConns} · ${latencyMs} ms`,
      metrics: {
        version: s?.version ?? 'unknown',
        sizeMb: Number(s?.db_size_mb ?? 0),
        connections: `${totalConns}/${maxConns}`,
        activeQueries: Number(s?.active_conns ?? 0),
        longQueries,
        blockedLocks,
        poolTotal: pool.totalCount,
        poolIdle: pool.idleCount,
        poolWaiting: pool.waitingCount,
        membersRows: tableMap.get('members') ?? 0,
        songsRows: tableMap.get('songs') ?? 0,
        appLogsRows: tableMap.get('app_logs') ?? 0,
      },
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (error) {
    return {
      id: 'postgres',
      name: 'PostgreSQL',
      status: 'fail',
      configured: true,
      latencyMs: Date.now() - t0,
      summary: `Ошибка подключения: ${error instanceof Error ? error.message : String(error)}`,
      metrics: { connected: false },
    };
  }
}

async function inspectRedisSubsystem(): Promise<SubsystemItem> {
  const t0 = Date.now();
  const redisUrl = String(process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) {
    return {
      id: 'redis',
      name: 'Redis',
      status: 'skip',
      configured: false,
      summary: 'Не сконфигурирован (работает локальный режим без кластерного fan-out)',
      metrics: { configured: false },
    };
  }
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: REDIS_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await withTimeout(client.connect(), REDIS_TIMEOUT_MS);
    const [pong, memInfo, clientsInfo] = await withTimeout(
      Promise.all([client.ping(), client.info('memory'), client.info('clients')]),
      REDIS_TIMEOUT_MS,
    );
    const latencyMs = Date.now() - t0;
    const usedMem = memInfo.match(/used_memory_human:([^\r\n]+)/)?.[1]?.trim() ?? '—';
    const connectedClients = Number(clientsInfo.match(/connected_clients:(\d+)/)?.[1] ?? 0);
    return {
      id: 'redis',
      name: 'Redis',
      status: pong === 'PONG' ? 'ok' : 'fail',
      configured: true,
      latencyMs,
      summary: `PING/PONG за ${latencyMs} ms · память ${usedMem} · клиентов ${connectedClients}`,
      metrics: {
        ping: pong,
        usedMemory: usedMem,
        connectedClients,
      },
    };
  } catch (error) {
    return {
      id: 'redis',
      name: 'Redis',
      status: 'fail',
      configured: true,
      latencyMs: Date.now() - t0,
      summary: `Недоступен: ${error instanceof Error ? error.message : String(error)}`,
      metrics: { configured: true, reachable: false },
    };
  } finally {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

async function inspectRealtimeSubsystem(): Promise<SubsystemItem> {
  const stats = getRealtimeWsStats();
  const warnings: string[] = [];
  if (stats.redisFanoutEnabled && (stats.pubStatus !== 'ready' || stats.subStatus !== 'ready')) {
    warnings.push(`Redis pub/sub статус: pub=${stats.pubStatus}, sub=${stats.subStatus}`);
  }
  return {
    id: 'realtime_ws',
    name: 'Realtime WebSocket',
    status: warnings.length > 0 ? 'warn' : 'ok',
    configured: true,
    summary: `Онлайн ${stats.onlineMembers} чел. · сокетов ${stats.connectedSockets} · комнат ${stats.activeRooms}`,
    metrics: {
      onlineMembers: stats.onlineMembers,
      connectedSockets: stats.connectedSockets,
      activeRooms: stats.activeRooms,
      redisFanout: stats.redisFanoutEnabled,
      pubStatus: stats.pubStatus ?? 'local',
      subStatus: stats.subStatus ?? 'local',
    },
    warnings: warnings.length ? warnings : undefined,
  };
}

async function inspectPushSubsystem(): Promise<SubsystemItem> {
  const vapid = getVapidConfig();
  let fcmReady = false;
  try {
    fcmReady = getFirebaseMessaging() != null;
  } catch {
    fcmReady = false;
  }
  let webSubs = 0;
  let fcmTokens = 0;
  if (pool) {
    try {
      const [w, f] = await Promise.all([
        pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM push_subscriptions'),
        pool
          .query<{ c: string }>('SELECT COUNT(*)::text AS c FROM fcm_tokens')
          .catch(() => ({ rows: [{ c: '0' }] })),
      ]);
      webSubs = Number(w.rows[0]?.c ?? 0);
      fcmTokens = Number(f.rows[0]?.c ?? 0);
    } catch {
      // ignore
    }
  }
  const anyReady = Boolean(vapid || fcmReady);
  const warnings: string[] = [];
  if (!vapid) warnings.push('Web Push (VAPID) не инициализирован');
  if (!fcmReady && fcmTokens > 0) warnings.push(`Есть ${fcmTokens} FCM-токенов, но Firebase Admin не настроен`);
  return {
    id: 'push',
    name: 'Push-уведомления (Web + FCM)',
    status: !anyReady ? 'warn' : warnings.length > 0 ? 'warn' : 'ok',
    configured: anyReady,
    summary: `VAPID: ${vapid ? `ok (${vapid.source})` : 'нет'} · FCM: ${fcmReady ? 'ok' : 'нет'} · подписок Web ${webSubs}, FCM ${fcmTokens}`,
    metrics: {
      vapidReady: Boolean(vapid),
      vapidSource: vapid?.source ?? 'none',
      fcmReady,
      webSubscriptions: webSubs,
      fcmTokens,
    },
    warnings: warnings.length ? warnings : undefined,
  };
}

async function inspectTelegramSubsystem(): Promise<SubsystemItem> {
  const t0 = Date.now();
  try {
    const [tg, proxy] = await Promise.all([
      getTelegramSettings(),
      getActiveTelegramProxyStatus().catch(() => null),
    ]);
    let sent24h = 0;
    let failed24h = 0;
    if (pool) {
      try {
        const { rows } = await pool.query<{ ok: string; failed: string }>(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'ok')::text AS ok,
            COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
          FROM telegram_send_logs
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `);
        sent24h = Number(rows[0]?.ok ?? 0);
        failed24h = Number(rows[0]?.failed ?? 0);
      } catch {
        // ignore
      }
    }
    const warnings: string[] = [];
    if (tg.enabled && !tg.has_bot_token) warnings.push('Telegram включён, но токен бота отсутствует');
    if (failed24h > 0) warnings.push(`Ошибок доставки за 24ч: ${failed24h}`);
    const status: SubsystemItem['status'] = !tg.enabled
      ? 'skip'
      : !tg.has_bot_token
        ? 'fail'
        : failed24h >= 5
          ? 'warn'
          : 'ok';
    return {
      id: 'telegram',
      name: 'Telegram Bot',
      status,
      configured: Boolean(tg.enabled && tg.has_bot_token),
      latencyMs: Date.now() - t0,
      summary: !tg.enabled
        ? 'Выключен в настройках'
        : `Активен · за 24ч: ${sent24h} ок / ${failed24h} ошибок${proxy?.used ? ` · прокси ${proxy.source}` : ''}`,
      metrics: {
        enabled: tg.enabled,
        hasToken: tg.has_bot_token,
        sent24h,
        failed24h,
        proxyEnabled: Boolean(proxy?.used),
      },
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (error) {
    return {
      id: 'telegram',
      name: 'Telegram Bot',
      status: 'warn',
      configured: false,
      summary: `Не удалось прочитать настройки: ${error instanceof Error ? error.message : String(error)}`,
      metrics: {},
    };
  }
}

async function inspectAiSubsystem(): Promise<SubsystemItem> {
  try {
    const cfg = await resolveLlmRuntimeConfig();
    const configured = Boolean(cfg.enabled && cfg.api_key);
    return {
      id: 'ai_llm',
      name: 'AI / LLM провайдер',
      status: !cfg.enabled ? 'skip' : cfg.api_key ? 'ok' : 'warn',
      configured,
      summary: !cfg.enabled
        ? 'Отключён в настройках интеграций'
        : cfg.api_key
          ? `Включён · модель ${cfg.default_model}`
          : 'Включён, но API-ключ не задан',
      metrics: {
        enabled: cfg.enabled,
        hasApiKey: Boolean(cfg.api_key),
        model: cfg.default_model,
        baseUrl: cfg.base_url,
      },
      warnings: cfg.enabled && !cfg.api_key ? ['Укажите API-ключ в Админке → Интеграции → ИИ'] : undefined,
    };
  } catch (error) {
    return {
      id: 'ai_llm',
      name: 'AI / LLM провайдер',
      status: 'warn',
      configured: false,
      summary: `Ошибка чтения настроек ИИ: ${error instanceof Error ? error.message : String(error)}`,
      metrics: {},
    };
  }
}

async function inspectSmsSubsystem(): Promise<SubsystemItem> {
  try {
    const sms = await resolveSmsRuntimeConfig();
    return {
      id: 'sms_ru',
      name: 'SMS.ru',
      status: !sms.enabled ? 'skip' : sms.apiId ? 'ok' : 'warn',
      configured: Boolean(sms.enabled && sms.apiId),
      summary: !sms.enabled
        ? 'Отключён в настройках'
        : sms.apiId
          ? `Активен${sms.senderName ? ` · отправитель ${sms.senderName}` : ''}`
          : 'Включён, но SMS_RU_API_ID не задан',
      metrics: {
        enabled: sms.enabled,
        hasApiId: Boolean(sms.apiId),
        senderName: sms.senderName,
      },
    };
  } catch (error) {
    return {
      id: 'sms_ru',
      name: 'SMS.ru',
      status: 'skip',
      configured: false,
      summary: `Недоступно: ${error instanceof Error ? error.message : String(error)}`,
      metrics: {},
    };
  }
}

async function inspectBackupsSubsystem(): Promise<SubsystemItem> {
  try {
    const [doc, backups] = await Promise.all([
      loadBackupSettingsDocument().catch(() => null),
      listBackups().catch(() => []),
    ]);
    const latest = backups[0] ?? null;
    const latestTs = latest?.created_at ? Date.parse(latest.created_at) : NaN;
    const ageHours = Number.isFinite(latestTs)
      ? Number(((Date.now() - latestTs) / 3_600_000).toFixed(1))
      : null;
    const warnings: string[] = [];
    if (doc?.last_run_status === 'error') {
      warnings.push(`Последний автобекап завершился ошибкой: ${doc.last_run_message ?? 'см. журнал'}`);
    }
    if (doc?.auto_enabled && (ageHours == null || ageHours > 168)) {
      warnings.push(
        ageHours == null
          ? 'Автобекап включён, но ещё нет ни одного архива'
          : `Последний бекап устарел (${ageHours} ч назад)`,
      );
    }
    return {
      id: 'backups',
      name: 'Резервное копирование',
      status:
        doc?.last_run_status === 'error'
          ? 'fail'
          : warnings.length > 0
            ? 'warn'
            : backups.length > 0
              ? 'ok'
              : 'skip',
      configured: Boolean(doc?.auto_enabled || backups.length > 0),
      summary: latest
        ? `Архивов: ${backups.length} · последний ${ageHours != null ? `${ageHours} ч назад` : (latest.created_at ?? '—')}${isBackupBusy() ? ' · идёт операция' : ''}`
        : 'Бекапов пока нет',
      metrics: {
        totalBackups: backups.length,
        autoEnabled: Boolean(doc?.auto_enabled),
        lastRunStatus: doc?.last_run_status ?? 'none',
        lastBackupAgeHours: ageHours,
        busy: isBackupBusy(),
        driveEnabled: Boolean(doc?.drive_enabled),
      },
      warnings: warnings.length ? warnings : undefined,
    };
  } catch (error) {
    return {
      id: 'backups',
      name: 'Резервное копирование',
      status: 'warn',
      configured: false,
      summary: `Ошибка инспекции: ${error instanceof Error ? error.message : String(error)}`,
      metrics: {},
    };
  }
}

async function inspectSecurityAndStorageSubsystem(): Promise<SubsystemItem[]> {
  const uploadsRoot = getUploadsRoot();
  const [diskInfo, writeCheck] = await Promise.all([readDiskInfo(), checkDirWritable(uploadsRoot)]);

  let activeSessions = 0;
  let expiredSessions = 0;
  if (pool) {
    try {
      const { rows } = await pool.query<{ active: string; expired: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE expires_at > NOW())::text AS active,
          COUNT(*) FILTER (WHERE expires_at <= NOW())::text AS expired
        FROM auth_sessions
      `);
      activeSessions = Number(rows[0]?.active ?? 0);
      expiredSessions = Number(rows[0]?.expired ?? 0);
    } catch {
      // ignore if table name differs
    }
  }

  const hasEncKey = Boolean(String(process.env.MESSAGE_ENCRYPTION_KEY ?? '').trim());
  const isProd = process.env.NODE_ENV === 'production';
  const secWarnings: string[] = [];
  if (isProd && !hasEncKey) secWarnings.push('Не задан MESSAGE_ENCRYPTION_KEY в production');
  if (expiredSessions > 5000) secWarnings.push(`Много просроченных сессий в БД: ${expiredSessions}`);

  const storageWarnings: string[] = [];
  if (!writeCheck.writable) storageWarnings.push(`Каталог uploads недоступен на запись: ${writeCheck.error}`);
  if (diskInfo && diskInfo.usagePercent >= 85) {
    storageWarnings.push(`Диск заполнен на ${diskInfo.usagePercent.toFixed(1)}%`);
  }

  return [
    {
      id: 'security_auth',
      name: 'Авторизация и безопасность',
      status: secWarnings.length > 0 ? 'warn' : 'ok',
      configured: true,
      summary: `NODE_ENV=${process.env.NODE_ENV ?? 'development'} · активных сессий: ${activeSessions} · шифрование: ${hasEncKey ? 'ok' : 'нет'}`,
      metrics: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        activeSessions,
        expiredSessions,
        messageEncryptionKey: hasEncKey,
      },
      warnings: secWarnings.length ? secWarnings : undefined,
    },
    {
      id: 'storage_disk',
      name: 'Файловое хранилище и диск',
      status: !writeCheck.writable
        ? 'fail'
        : storageWarnings.length > 0
          ? 'warn'
          : 'ok',
      configured: true,
      summary: diskInfo
        ? `Занято ${diskInfo.usagePercent.toFixed(1)}% · свободно ${diskInfo.availableGb} GB · запись uploads: ${writeCheck.writable ? 'ok' : 'ошибка'}`
        : `Запись uploads: ${writeCheck.writable ? 'ok' : 'ошибка'}`,
      metrics: {
        uploadsWritable: writeCheck.writable,
        diskUsagePercent: diskInfo?.usagePercent ?? null,
        diskAvailableGb: diskInfo?.availableGb ?? null,
        mountPoint: diskInfo?.mountPoint ?? null,
      },
      warnings: storageWarnings.length ? storageWarnings : undefined,
    },
  ];
}

export async function collectSubsystemInventory(): Promise<SubsystemInventory> {
  const started = Date.now();
  const [
    postgres,
    redis,
    supabaseCheck,
    livekitCheck,
    realtime,
    push,
    telegram,
    ai,
    sms,
    backups,
    secAndStorage,
  ] = await Promise.all([
    inspectPostgresSubsystem(),
    inspectRedisSubsystem(),
    checkSupabase(),
    checkLiveKit(),
    inspectRealtimeSubsystem(),
    inspectPushSubsystem(),
    inspectTelegramSubsystem(),
    inspectAiSubsystem(),
    inspectSmsSubsystem(),
    inspectBackupsSubsystem(),
    inspectSecurityAndStorageSubsystem(),
  ]);

  const supabaseItem: SubsystemItem = {
    id: 'supabase',
    name: 'Supabase Storage',
    status: supabaseCheck.status,
    configured: supabaseCheck.status !== 'skip',
    latencyMs: supabaseCheck.durationMs,
    summary: supabaseCheck.details,
    metrics: {
      configured: supabaseCheck.status !== 'skip',
      publicUrlWarning: shouldWarnMissingSupabaseStoragePublicUrl(),
    },
  };

  const livekitItem: SubsystemItem = {
    id: 'livekit',
    name: 'LiveKit (звонки)',
    status: livekitCheck.status,
    configured: livekitCheck.status !== 'skip',
    latencyMs: livekitCheck.durationMs,
    summary: livekitCheck.details,
    metrics: {
      configured: livekitCheck.status !== 'skip',
      routingMode: resolveLiveKitRoutingMode(),
    },
  };

  return {
    collectedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    items: [
      postgres,
      realtime,
      redis,
      supabaseItem,
      livekitItem,
      telegram,
      push,
      ai,
      sms,
      backups,
      ...secAndStorage,
    ],
    cronJobs: getCronJobHeartbeats(),
  };
}
