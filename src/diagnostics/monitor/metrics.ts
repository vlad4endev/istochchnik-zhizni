import fs from 'node:fs';
import os from 'node:os';
import v8 from 'node:v8';
import type {
  CronJobHeartbeat,
  EndpointMetricSummary,
  MonitorMetricsSnapshot,
  MonitorMinutePoint,
  RecentError5xxSample,
} from '../types';

/**
 * Легковесный сборщик метрик процесса: HTTP-запросы, пер-маршрутная телеметрия,
 * латентность p50/p95/p99, event loop lag, V8 heap, системная память (с учётом
 * Linux MemAvailable), детектор всплесков 5xx и heartbeat фоновых cron-задач.
 * Работает полностью в памяти с ограниченными буферами — не нагружает сервер.
 */

const LATENCY_BUFFER_SIZE = 2000;
const MINUTE_HISTORY_SIZE = 60;
const MAX_ENDPOINT_TRACKED = 250;
const ENDPOINT_LATENCY_CAP = 200;
const RECENT_5XX_CAP = 30;
const EVENT_LOOP_SAMPLE_INTERVAL_MS = 10_000;
const EVENT_LOOP_SAMPLE_WINDOW_MS = 200;

interface MinuteBucket {
  minuteStart: number;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  durations: number[];
}

interface EventLoopSample {
  lagMs: number;
  at: number;
}

interface EndpointBucket {
  route: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  totalDurationMs: number;
  maxMs: number;
  durations: number[];
  lastStatus: number;
  lastSeenAt: string;
}

const latencyBuffer: number[] = [];
let totalRequests = 0;
let totalErrors4xx = 0;
let totalErrors5xx = 0;
let unhandledRejections = 0;
let uncaughtExceptions = 0;

const minuteBuckets: MinuteBucket[] = [];
const minuteHistory: MonitorMinutePoint[] = [];
const eventLoopSamples: EventLoopSample[] = [];
const endpointStats = new Map<string, EndpointBucket>();
const recentErrors5xx: RecentError5xxSample[] = [];
const recent5xxTimestamps: number[] = [];
const cronHeartbeats = new Map<string, CronJobHeartbeat>();

let eventLoopTimer: NodeJS.Timeout | null = null;
let lastMinuteFlushCheck = 0;

function currentMinuteStart(now = Date.now()): number {
  return Math.floor(now / 60_000) * 60_000;
}

function getOrCreateCurrentBucket(now = Date.now()): MinuteBucket {
  const start = currentMinuteStart(now);
  let bucket = minuteBuckets[minuteBuckets.length - 1];
  if (!bucket || bucket.minuteStart !== start) {
    bucket = { minuteStart: start, requests: 0, errors4xx: 0, errors5xx: 0, durations: [] };
    minuteBuckets.push(bucket);
    while (minuteBuckets.length > 3) minuteBuckets.shift();
  }
  return bucket;
}

function flushCompletedMinutes(now = Date.now()): void {
  if (now - lastMinuteFlushCheck < 15_000) return;
  lastMinuteFlushCheck = now;
  const currentStart = currentMinuteStart(now);
  for (let i = 0; i < minuteBuckets.length; ) {
    const bucket = minuteBuckets[i]!;
    if (bucket.minuteStart >= currentStart) {
      i += 1;
      continue;
    }
    const total = bucket.requests;
    const errors = bucket.errors5xx;
    minuteHistory.push({
      minuteStart: new Date(bucket.minuteStart).toISOString(),
      requests: total,
      errors4xx: bucket.errors4xx,
      errors5xx: errors,
      errorRatePercent: total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0,
      p95Ms: percentile(bucket.durations, 95),
    });
    minuteBuckets.splice(i, 1);
  }
  while (minuteHistory.length > MINUTE_HISTORY_SIZE) minuteHistory.shift();
}

/**
 * Нормализация пути для группировки метрик:
 * `/api/users/42` -> `/api/users/:id`, UUID -> `:uuid`, даты -> `:date`, длинные токены -> `:token`.
 */
export function normalizeRoutePath(method: string, rawPath: string): string {
  const clean = String(rawPath || '/')
    .split('?')[0]!
    .replace(/\/+/g, '/')
    .replace(/\/$/, '') || '/';
  const normalized = clean
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/:uuid')
    .replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, '/:date')
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/[a-zA-Z0-9_-]{24,}(?=\/|$)/g, '/:token');
  return `${method.toUpperCase()} ${normalized}`;
}

export function recordRequest(
  status: number,
  durationMs: number,
  method = 'GET',
  rawPath = '/',
  errorMessage?: string,
): void {
  const now = Date.now();
  totalRequests += 1;
  if (status >= 500) totalErrors5xx += 1;
  else if (status >= 400) totalErrors4xx += 1;

  const bucket = getOrCreateCurrentBucket(now);
  bucket.requests += 1;
  if (status >= 500) bucket.errors5xx += 1;
  else if (status >= 400) bucket.errors4xx += 1;
  const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
  if (safeDuration > 0) {
    bucket.durations.push(safeDuration);
    latencyBuffer.push(safeDuration);
    if (latencyBuffer.length > LATENCY_BUFFER_SIZE) latencyBuffer.shift();
  }

  // Пер-маршрутная телеметрия (игнорируем собственный опрос монитора, чтобы не шуметь).
  const pathOnly = String(rawPath || '/').split('?')[0] || '/';
  if (!pathOnly.startsWith('/api/diagnostics/monitor')) {
    const route = normalizeRoutePath(method, pathOnly);
    let ep = endpointStats.get(route);
    if (!ep) {
      if (endpointStats.size >= MAX_ENDPOINT_TRACKED) {
        // Вытесняем самый старый ключ по порядку вставки.
        const oldestKey = endpointStats.keys().next().value;
        if (oldestKey !== undefined) endpointStats.delete(oldestKey);
      }
      ep = {
        route,
        requests: 0,
        errors4xx: 0,
        errors5xx: 0,
        totalDurationMs: 0,
        maxMs: 0,
        durations: [],
        lastStatus: status,
        lastSeenAt: new Date(now).toISOString(),
      };
      endpointStats.set(route, ep);
    }
    ep.requests += 1;
    if (status >= 500) ep.errors5xx += 1;
    else if (status >= 400) ep.errors4xx += 1;
    ep.totalDurationMs += safeDuration;
    if (safeDuration > ep.maxMs) ep.maxMs = safeDuration;
    ep.durations.push(safeDuration);
    if (ep.durations.length > ENDPOINT_LATENCY_CAP) ep.durations.shift();
    ep.lastStatus = status;
    ep.lastSeenAt = new Date(now).toISOString();
  }

  if (status >= 500) {
    recent5xxTimestamps.push(now);
    // Храним метки до 15 минут.
    const trimBefore = now - 15 * 60_000;
    while (recent5xxTimestamps.length > 0 && recent5xxTimestamps[0]! < trimBefore) {
      recent5xxTimestamps.shift();
    }
    recentErrors5xx.unshift({
      at: new Date(now).toISOString(),
      method: method.toUpperCase(),
      path: pathOnly,
      status,
      durationMs: Math.round(safeDuration),
      ...(errorMessage ? { message: errorMessage.slice(0, 300) } : {}),
    });
    while (recentErrors5xx.length > RECENT_5XX_CAP) recentErrors5xx.pop();
  }

  flushCompletedMinutes(now);
}

/** Возвращает количество 5xx за последние `windowSec` секунд и последние затронутые пути. */
export function getRecent5xxBurst(windowSec: number): { count: number; samplePaths: string[] } {
  const cutoff = Date.now() - Math.max(5, windowSec) * 1000;
  let count = 0;
  for (let i = recent5xxTimestamps.length - 1; i >= 0; i -= 1) {
    if (recent5xxTimestamps[i]! >= cutoff) count += 1;
    else break;
  }
  const samplePaths = Array.from(
    new Set(
      recentErrors5xx
        .filter((item) => Date.parse(item.at) >= cutoff)
        .slice(0, 5)
        .map((item) => `${item.method} ${item.path} (${item.status})`),
    ),
  );
  return { count, samplePaths };
}

export function recordUnhandledRejection(): void {
  unhandledRejections += 1;
}

export function recordUncaughtException(): void {
  uncaughtExceptions += 1;
}

export function recordCronHeartbeat(name: string, ok: boolean, durationMs: number, error?: unknown): void {
  const existing = cronHeartbeats.get(name);
  const errorText = error instanceof Error ? error.message : error ? String(error) : undefined;
  cronHeartbeats.set(name, {
    name,
    lastRunAt: new Date().toISOString(),
    ok,
    durationMs: Math.max(0, Math.round(durationMs)),
    runs: (existing?.runs ?? 0) + 1,
    failures: (existing?.failures ?? 0) + (ok ? 0 : 1),
    lastError: ok ? existing?.lastError : errorText,
  });
}

export function getCronJobHeartbeats(): CronJobHeartbeat[] {
  return [...cronHeartbeats.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number((sorted[idx] ?? 0).toFixed(2));
}

function sampleEventLoopLag(): void {
  const started = performance.now();
  const timer = setTimeout(() => {
    const lag = Math.max(0, performance.now() - started - EVENT_LOOP_SAMPLE_WINDOW_MS);
    eventLoopSamples.push({ lagMs: Number(lag.toFixed(2)), at: Date.now() });
    while (eventLoopSamples.length > 180) eventLoopSamples.shift();
  }, EVENT_LOOP_SAMPLE_WINDOW_MS);
  timer.unref?.();
}

export function ensureMetricsCollector(): void {
  if (eventLoopTimer) return;
  sampleEventLoopLag();
  eventLoopTimer = setInterval(sampleEventLoopLag, EVENT_LOOP_SAMPLE_INTERVAL_MS);
  eventLoopTimer.unref?.();
}

export function getEventLoopStats(): { lagMs: number; maxLagMs: number; p95LagMs: number } {
  const recent = eventLoopSamples.slice(-6);
  const lags = recent.map((s) => s.lagMs);
  const lagMs = lags.length > 0 ? Number((lags.reduce((a, b) => a + b, 0) / lags.length).toFixed(2)) : 0;
  const maxLagMs = lags.length > 0 ? Math.max(...lags) : 0;
  const p95LagMs = percentile(lags, 95);
  return { lagMs, maxLagMs, p95LagMs };
}

/**
 * На Linux `os.freemem()` не учитывает page cache / buffers и часто показывает >95%
 * занятой памяти на абсолютно здоровом сервере. Читаем `MemAvailable` из `/proc/meminfo`.
 */
export function readSystemMemoryInfo(): {
  totalBytes: number;
  availableBytes: number;
  freeBytes: number;
  usagePercent: number;
  source: 'proc_meminfo' | 'os_freemem';
} {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  if (process.platform === 'linux') {
    try {
      const content = fs.readFileSync('/proc/meminfo', 'utf8');
      const totalMatch = content.match(/^MemTotal:\s+(\d+)\s+kB/m);
      const availMatch = content.match(/^MemAvailable:\s+(\d+)\s+kB/m);
      if (totalMatch && availMatch) {
        const total = Number(totalMatch[1]) * 1024;
        const available = Number(availMatch[1]) * 1024;
        if (total > 0 && available >= 0) {
          const used = Math.max(0, total - available);
          return {
            totalBytes: total,
            availableBytes: available,
            freeBytes,
            usagePercent: Number(((used / total) * 100).toFixed(2)),
            source: 'proc_meminfo',
          };
        }
      }
    } catch {
      // fallback to os.freemem
    }
  }
  const usagePercent =
    totalBytes > 0 ? Number((((totalBytes - freeBytes) / totalBytes) * 100).toFixed(2)) : 0;
  return {
    totalBytes,
    availableBytes: freeBytes,
    freeBytes,
    usagePercent,
    source: 'os_freemem',
  };
}

/** Ошибки 5xx за последние N минут (для правила error rate). */
export function getErrorRateWindow(windowMinutes: number): {
  total: number;
  errors5xx: number;
  errorRatePercent: number;
} {
  const cutoff = currentMinuteStart() - (windowMinutes - 1) * 60_000;
  let total = 0;
  let errors5xx = 0;
  for (const bucket of minuteBuckets) {
    if (bucket.minuteStart >= cutoff) {
      total += bucket.requests;
      errors5xx += bucket.errors5xx;
    }
  }
  for (const point of minuteHistory) {
    const ts = Date.parse(point.minuteStart);
    if (Number.isFinite(ts) && ts >= cutoff) {
      total += point.requests;
      errors5xx += point.errors5xx;
    }
  }
  const errorRatePercent = total > 0 ? Number(((errors5xx / total) * 100).toFixed(2)) : 0;
  return { total, errors5xx, errorRatePercent };
}

function buildEndpointSummary(ep: EndpointBucket): EndpointMetricSummary {
  return {
    route: ep.route,
    requests: ep.requests,
    errors4xx: ep.errors4xx,
    errors5xx: ep.errors5xx,
    avgMs: ep.requests > 0 ? Number((ep.totalDurationMs / ep.requests).toFixed(1)) : 0,
    p95Ms: percentile(ep.durations, 95),
    maxMs: Number(ep.maxMs.toFixed(1)),
    lastStatus: ep.lastStatus,
    lastSeenAt: ep.lastSeenAt,
  };
}

export function getMetricsSnapshot(): MonitorMetricsSnapshot {
  ensureMetricsCollector();
  flushCompletedMinutes();
  const mem = process.memoryUsage();
  const heapStats = v8.getHeapStatistics();
  const heapLimitBytes = heapStats.heap_size_limit || mem.heapTotal || 1;
  const sysMem = readSystemMemoryInfo();

  const lastMinute = minuteBuckets[minuteBuckets.length - 1];
  const perMinute = lastMinute && lastMinute.minuteStart === currentMinuteStart() ? lastMinute.requests : 0;
  const avg =
    latencyBuffer.length > 0
      ? Number((latencyBuffer.reduce((a, b) => a + b, 0) / latencyBuffer.length).toFixed(2))
      : 0;
  const eventLoop = getEventLoopStats();

  const allEndpoints = [...endpointStats.values()].map(buildEndpointSummary);
  const topErrorEndpoints = allEndpoints
    .filter((ep) => ep.errors5xx > 0 || ep.errors4xx > 0)
    .sort((a, b) => b.errors5xx - a.errors5xx || b.errors4xx - a.errors4xx)
    .slice(0, 10);
  const slowestEndpoints = allEndpoints
    .filter((ep) => ep.requests > 0)
    .sort((a, b) => b.p95Ms - a.p95Ms)
    .slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    processUptimeSec: Number(process.uptime().toFixed(1)),
    nodeVersion: process.version,
    pid: process.pid,
    env: process.env.NODE_ENV ?? 'development',
    cpuCores: Math.max(1, os.cpus().length),
    loadAverage: os.loadavg().map((v) => Number(v.toFixed(2))),
    requests: {
      total: totalRequests,
      errors4xx: totalErrors4xx,
      errors5xx: totalErrors5xx,
      perMinute,
      errorRatePercent:
        totalRequests > 0 ? Number(((totalErrors5xx / totalRequests) * 100).toFixed(2)) : 0,
      latency: {
        p50Ms: percentile(latencyBuffer, 50),
        p95Ms: percentile(latencyBuffer, 95),
        p99Ms: percentile(latencyBuffer, 99),
        avgMs: avg,
      },
    },
    eventLoop,
    memory: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      heapLimitBytes,
      externalBytes: mem.external,
      usagePercent: Number(((mem.heapUsed / heapLimitBytes) * 100).toFixed(2)),
    },
    systemMemory: sysMem,
    unhandledRejections,
    uncaughtExceptions,
    minuteHistory: [...minuteHistory],
    topErrorEndpoints,
    slowestEndpoints,
    recentErrors5xx: [...recentErrors5xx],
  };
}

export function resetMetricsForTests(): void {
  latencyBuffer.length = 0;
  minuteBuckets.length = 0;
  minuteHistory.length = 0;
  eventLoopSamples.length = 0;
  endpointStats.clear();
  recentErrors5xx.length = 0;
  recent5xxTimestamps.length = 0;
  cronHeartbeats.clear();
  totalRequests = 0;
  totalErrors4xx = 0;
  totalErrors5xx = 0;
  unhandledRejections = 0;
  uncaughtExceptions = 0;
  lastMinuteFlushCheck = 0;
}
