import { pool } from '../../config/db';
import type { MonitorSettings, MonitorThresholds } from '../types';

/**
 * Персистентные настройки мониторинга и оповещений администратора.
 * Хранятся в `global_settings.monitor_settings_json` (как ai_settings_json).
 * Если БД недоступна — работают дефолты из env и in-memory кэш.
 */

const CACHE_TTL_MS = 15_000;

function envNum(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, raw));
}

export function buildDefaultMonitorSettings(): MonitorSettings {
  const disabled = (process.env.MONITOR_DISABLED ?? '').toLowerCase() === 'true';
  const opsChat = String(process.env.MONITOR_TELEGRAM_CHAT_ID ?? '').trim() || null;
  const webhook = String(process.env.MONITOR_WEBHOOK_URL ?? '').trim() || null;

  return {
    enabled: !disabled,
    intervalSec: envNum('MONITOR_INTERVAL_SEC', 30, 10, 3600),
    notifyChannels: {
      push: true,
      telegram: true,
      webhookUrl: webhook,
    },
    telegramOpsChatId: opsChat,
    notifyOn: {
      critical: true,
      warning: true,
      recovery: true,
      crash: true,
      http5xxBurst: true,
      restart: true,
    },
    thresholds: {
      eventLoopWarnMs: envNum('MONITOR_EVENTLOOP_WARN_MS', 100, 10, 10_000),
      eventLoopFailMs: envNum('MONITOR_EVENTLOOP_FAIL_MS', 500, 50, 30_000),
      heapWarnPercent: envNum('MONITOR_HEAP_WARN_PERCENT', 80, 30, 99),
      heapFailPercent: envNum('MONITOR_HEAP_FAIL_PERCENT', 92, 40, 99),
      systemMemWarnPercent: envNum('MONITOR_SYSMEM_WARN_PERCENT', 88, 30, 99),
      systemMemFailPercent: envNum('MONITOR_SYSMEM_FAIL_PERCENT', 95, 40, 99),
      diskWarnPercent: envNum('MONITOR_DISK_WARN_PERCENT', 85, 30, 99),
      diskFailPercent: envNum('MONITOR_DISK_FAIL_PERCENT', 94, 40, 99),
      latencyP95WarnMs: envNum('MONITOR_P95_WARN_MS', 1500, 100, 60_000),
      latencyP95FailMs: envNum('MONITOR_P95_FAIL_MS', 5000, 200, 120_000),
      errorRateWindowMin: envNum('MONITOR_ERRORRATE_WINDOW_MIN', 5, 1, 60),
      errorRateWarnPercent: envNum('MONITOR_ERRORRATE_WARN_PERCENT', 5, 0.5, 100),
      errorRateFailPercent: envNum('MONITOR_ERRORRATE_FAIL_PERCENT', 20, 1, 100),
      dbLatencyWarnMs: envNum('MONITOR_DB_LATENCY_WARN_MS', 800, 50, 10_000),
      http5xxBurstCount: envNum('MONITOR_HTTP_5XX_BURST_COUNT', 5, 2, 200),
      http5xxBurstWindowSec: envNum('MONITOR_HTTP_5XX_BURST_WINDOW_SEC', 60, 10, 600),
    },
    cooldownCriticalMin: envNum('MONITOR_ALERT_COOLDOWN_CRITICAL_MIN', 10, 1, 1440),
    cooldownWarningMin: envNum('MONITOR_ALERT_COOLDOWN_MIN', 30, 1, 1440),
    mutedChecks: [],
  };
}

function clamp(val: unknown, fallback: number, min: number, max: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeWebhookUrl(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeMonitorSettings(raw: unknown, base = buildDefaultMonitorSettings()): MonitorSettings {
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const nc = (r.notifyChannels && typeof r.notifyChannels === 'object'
    ? r.notifyChannels
    : {}) as Record<string, unknown>;
  const no = (r.notifyOn && typeof r.notifyOn === 'object' ? r.notifyOn : {}) as Record<string, unknown>;
  const th = (r.thresholds && typeof r.thresholds === 'object'
    ? r.thresholds
    : {}) as Partial<Record<keyof MonitorThresholds, unknown>>;

  const thresholds: MonitorThresholds = {
    eventLoopWarnMs: clamp(th.eventLoopWarnMs, base.thresholds.eventLoopWarnMs, 10, 10_000),
    eventLoopFailMs: clamp(th.eventLoopFailMs, base.thresholds.eventLoopFailMs, 50, 30_000),
    heapWarnPercent: clamp(th.heapWarnPercent, base.thresholds.heapWarnPercent, 30, 99),
    heapFailPercent: clamp(th.heapFailPercent, base.thresholds.heapFailPercent, 40, 99),
    systemMemWarnPercent: clamp(th.systemMemWarnPercent, base.thresholds.systemMemWarnPercent, 30, 99),
    systemMemFailPercent: clamp(th.systemMemFailPercent, base.thresholds.systemMemFailPercent, 40, 99),
    diskWarnPercent: clamp(th.diskWarnPercent, base.thresholds.diskWarnPercent, 30, 99),
    diskFailPercent: clamp(th.diskFailPercent, base.thresholds.diskFailPercent, 40, 99),
    latencyP95WarnMs: clamp(th.latencyP95WarnMs, base.thresholds.latencyP95WarnMs, 100, 60_000),
    latencyP95FailMs: clamp(th.latencyP95FailMs, base.thresholds.latencyP95FailMs, 200, 120_000),
    errorRateWindowMin: clamp(th.errorRateWindowMin, base.thresholds.errorRateWindowMin, 1, 60),
    errorRateWarnPercent: clamp(th.errorRateWarnPercent, base.thresholds.errorRateWarnPercent, 0.5, 100),
    errorRateFailPercent: clamp(th.errorRateFailPercent, base.thresholds.errorRateFailPercent, 1, 100),
    dbLatencyWarnMs: clamp(th.dbLatencyWarnMs, base.thresholds.dbLatencyWarnMs, 50, 10_000),
    http5xxBurstCount: clamp(th.http5xxBurstCount, base.thresholds.http5xxBurstCount, 2, 200),
    http5xxBurstWindowSec: clamp(th.http5xxBurstWindowSec, base.thresholds.http5xxBurstWindowSec, 10, 600),
  };

  // Гарантируем fail >= warn для каждой пары порогов.
  if (thresholds.eventLoopFailMs < thresholds.eventLoopWarnMs) {
    thresholds.eventLoopFailMs = thresholds.eventLoopWarnMs;
  }
  if (thresholds.heapFailPercent < thresholds.heapWarnPercent) {
    thresholds.heapFailPercent = thresholds.heapWarnPercent;
  }
  if (thresholds.systemMemFailPercent < thresholds.systemMemWarnPercent) {
    thresholds.systemMemFailPercent = thresholds.systemMemWarnPercent;
  }
  if (thresholds.diskFailPercent < thresholds.diskWarnPercent) {
    thresholds.diskFailPercent = thresholds.diskWarnPercent;
  }
  if (thresholds.latencyP95FailMs < thresholds.latencyP95WarnMs) {
    thresholds.latencyP95FailMs = thresholds.latencyP95WarnMs;
  }
  if (thresholds.errorRateFailPercent < thresholds.errorRateWarnPercent) {
    thresholds.errorRateFailPercent = thresholds.errorRateWarnPercent;
  }

  const opsChatRaw =
    r.telegramOpsChatId === undefined ? base.telegramOpsChatId : r.telegramOpsChatId;
  const telegramOpsChatId =
    opsChatRaw === null ? null : String(opsChatRaw).trim() || null;

  const webhookRaw =
    nc.webhookUrl === undefined ? base.notifyChannels.webhookUrl : nc.webhookUrl;

  const mutedChecks = Array.isArray(r.mutedChecks)
    ? Array.from(new Set(r.mutedChecks.map((v) => String(v).trim()).filter(Boolean))).slice(0, 50)
    : base.mutedChecks;

  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : base.enabled,
    intervalSec: Math.floor(clamp(r.intervalSec, base.intervalSec, 10, 3600)),
    notifyChannels: {
      push: typeof nc.push === 'boolean' ? nc.push : base.notifyChannels.push,
      telegram: typeof nc.telegram === 'boolean' ? nc.telegram : base.notifyChannels.telegram,
      webhookUrl: normalizeWebhookUrl(webhookRaw),
    },
    telegramOpsChatId,
    notifyOn: {
      critical: typeof no.critical === 'boolean' ? no.critical : base.notifyOn.critical,
      warning: typeof no.warning === 'boolean' ? no.warning : base.notifyOn.warning,
      recovery: typeof no.recovery === 'boolean' ? no.recovery : base.notifyOn.recovery,
      crash: typeof no.crash === 'boolean' ? no.crash : base.notifyOn.crash,
      http5xxBurst: typeof no.http5xxBurst === 'boolean' ? no.http5xxBurst : base.notifyOn.http5xxBurst,
      restart: typeof no.restart === 'boolean' ? no.restart : base.notifyOn.restart,
    },
    thresholds,
    cooldownCriticalMin: Math.floor(clamp(r.cooldownCriticalMin, base.cooldownCriticalMin, 1, 1440)),
    cooldownWarningMin: Math.floor(clamp(r.cooldownWarningMin, base.cooldownWarningMin, 1, 1440)),
    mutedChecks,
  };
}

let columnEnsured = false;
let cachedSettings: MonitorSettings = buildDefaultMonitorSettings();
let cacheExpiresAt = 0;

async function ensureMonitorSettingsColumn(): Promise<void> {
  if (!pool || columnEnsured) return;
  await pool.query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS monitor_settings_json TEXT');
  columnEnsured = true;
}

/** Синхронный доступ к последнему загруженному значению (для горячего пути HTTP/алертов). */
export function getCachedMonitorSettings(): MonitorSettings {
  return cachedSettings;
}

export async function loadMonitorSettings(forceRefresh = false): Promise<MonitorSettings> {
  if (!forceRefresh && Date.now() < cacheExpiresAt) {
    return cachedSettings;
  }
  if (!pool) {
    cachedSettings = buildDefaultMonitorSettings();
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedSettings;
  }
  try {
    await ensureMonitorSettingsColumn();
    const { rows } = await pool.query<{ monitor_settings_json?: string | null }>(
      'SELECT monitor_settings_json FROM global_settings WHERE id = 1',
    );
    const raw = rows[0]?.monitor_settings_json;
    if (typeof raw === 'string' && raw.trim()) {
      cachedSettings = normalizeMonitorSettings(JSON.parse(raw) as unknown);
    } else {
      cachedSettings = buildDefaultMonitorSettings();
    }
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return cachedSettings;
  } catch (error) {
    console.warn('[monitor] Не удалось прочитать monitor_settings_json:', error instanceof Error ? error.message : error);
    return cachedSettings;
  }
}

export type MonitorSettingsPatch = Partial<{
  enabled: boolean;
  intervalSec: number;
  notifyChannels: Partial<MonitorSettings['notifyChannels']>;
  telegramOpsChatId: string | null;
  notifyOn: Partial<MonitorSettings['notifyOn']>;
  thresholds: Partial<MonitorThresholds>;
  cooldownCriticalMin: number;
  cooldownWarningMin: number;
  mutedChecks: string[];
}>;

export async function updateMonitorSettings(patch: MonitorSettingsPatch): Promise<MonitorSettings> {
  const current = await loadMonitorSettings(true);
  const merged = normalizeMonitorSettings(
    {
      ...current,
      ...patch,
      notifyChannels: {
        ...current.notifyChannels,
        ...(patch.notifyChannels ?? {}),
      },
      notifyOn: {
        ...current.notifyOn,
        ...(patch.notifyOn ?? {}),
      },
      thresholds: {
        ...current.thresholds,
        ...(patch.thresholds ?? {}),
      },
    },
    current,
  );

  cachedSettings = merged;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  if (pool) {
    await ensureMonitorSettingsColumn();
    await pool.query(
      `INSERT INTO global_settings (id, start_date, monitor_settings_json)
       VALUES (1, CURRENT_DATE, $1)
       ON CONFLICT (id) DO UPDATE SET monitor_settings_json = EXCLUDED.monitor_settings_json`,
      [JSON.stringify(merged)],
    );
  }
  return merged;
}

export function resetSettingsCacheForTests(override?: Partial<MonitorSettings>): void {
  columnEnsured = false;
  cachedSettings = normalizeMonitorSettings(override ?? {}, buildDefaultMonitorSettings());
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}
