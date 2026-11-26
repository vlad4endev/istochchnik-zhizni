import os from 'node:os';
import { pool } from '../../config/db';
import { writeAppLog } from '../../services/appLogService';
import type {
  AlertSeverity,
  MonitorAlert,
  MonitorCheckResult,
  MonitorMetricsSnapshot,
  MonitorRunResult,
  MonitorSettings,
  MonitorStatusResponse,
} from '../types';
import {
  acknowledgeAlert,
  aggregateMonitorStatus,
  getActiveAlerts,
  getAlertHistory,
  hydrateAlertsFromDb,
  raiseAlert,
  raiseManualAlert,
  resolveAlerts,
  resolveManualAlert,
} from './alerts';
import { collectSubsystemInventory, runMonitorChecks } from './checks';
import {
  ensureMetricsCollector,
  getMetricsSnapshot,
  getRecent5xxBurst,
  recordUncaughtException,
  recordUnhandledRejection,
} from './metrics';
import {
  getNotificationChannelsSummary,
  notifyAdmins,
  sendTestAlertToAdmins,
  type AdminNotifyResult,
} from './notifyAdmins';
import {
  getCachedMonitorSettings,
  loadMonitorSettings,
  updateMonitorSettings,
  type MonitorSettingsPatch,
} from './settings';

/**
 * Системный вотчдог:
 * - фоновый цикл проверок (динамический интервал из БД/env);
 * - немедленное обнаружение всплесков HTTP 5xx;
 * - перехват необработанных исключений / крашей и неожиданного рестарта;
 * - доставка оповещений администраторам (Push, Telegram, Webhook).
 */

let watchdogTimer: NodeJS.Timeout | null = null;
let cycleRunning = false;
let lastRun: MonitorRunResult | null = null;
let lastRunAt: string | null = null;
let currentIntervalSec = 30;
let runtimeStateTableEnsured = false;

const ALERT_TITLES: Record<string, string> = {
  database: 'База данных PostgreSQL недоступна или перегружена',
  redis: 'Redis недоступен',
  supabase: 'Supabase Storage недоступен',
  livekit: 'LiveKit (звонки) недоступен',
  telegram: 'Проблемы с доставкой Telegram',
  disk: 'Диск почти заполнен',
  event_loop: 'Event loop перегружен',
  process_memory: 'Память Node.js (V8 Heap) на исходе',
  system_memory: 'Оперативная память сервера почти исчерпана',
  cpu_load: 'Высокая нагрузка на CPU',
  error_rate: 'Высокий уровень ошибок HTTP 5xx',
  latency_p95: 'API отвечает слишком медленно (p95)',
  critical_env: 'Не заданы критичные переменные окружения',
};

function describeCheck(check: MonitorCheckResult): string {
  return `${check.label}: ${check.details}`;
}

function shouldSendNotificationFor(severity: AlertSeverity, settings: MonitorSettings): boolean {
  return severity === 'critical' ? settings.notifyOn.critical : settings.notifyOn.warning;
}

/** Один цикл мониторинга. Вызывается фоновым таймером и вручную из админки. */
export async function runMonitorCycle(): Promise<MonitorRunResult> {
  if (cycleRunning && lastRun) {
    return lastRun;
  }
  cycleRunning = true;
  try {
    const settings = await loadMonitorSettings();
    const checks = await runMonitorChecks();
    const resolved = resolveAlerts(checks);
    const raised: MonitorAlert[] = [];

    for (const check of checks) {
      if (check.status === 'fail' || check.status === 'warn') {
        const title = ALERT_TITLES[check.id] ?? `Проверка «${check.label}» провалена`;
        const effectiveSeverity: AlertSeverity =
          check.status === 'fail' ? check.severity : 'warning';
        const outcome = raiseAlert(check, title, describeCheck(check), effectiveSeverity);
        if (outcome.shouldNotify && shouldSendNotificationFor(effectiveSeverity, settings)) {
          void notifyAdmins({
            title: check.status === 'fail' ? title : `Внимание: ${title}`,
            body: `${check.details}\n\nВремя фиксации: ${new Date().toLocaleString('ru-RU')}`,
            severity: effectiveSeverity,
            kind: 'alert',
            url: '/admin?tab=diagnostics',
            tag: `system-alert-${check.id}`,
          }).catch((err) => {
            console.warn('[monitor] notify failed:', err instanceof Error ? err.message : err);
          });
        }
        raised.push(outcome.alert);
      }
    }

    if (settings.notifyOn.recovery) {
      for (const alert of resolved) {
        void notifyAdmins({
          title: `Восстановлено: ${alert.title}`,
          body: `Проблема устранена в ${new Date().toLocaleTimeString('ru-RU')}. Инцидент длился с ${new Date(alert.firstSeenAt).toLocaleString('ru-RU')} (срабатываний: ${alert.occurrences}).`,
          severity: 'warning',
          kind: 'resolved',
          url: '/admin?tab=diagnostics',
          tag: `system-resolved-${alert.checkId}`,
        }).catch((err) => {
          console.warn('[monitor] resolve notify failed:', err instanceof Error ? err.message : err);
        });
      }
    }

    const run: MonitorRunResult = {
      generatedAt: new Date().toISOString(),
      overall: aggregateMonitorStatus(checks),
      checks,
      raisedAlerts: raised,
      resolvedAlerts: resolved,
    };
    lastRun = run;
    lastRunAt = run.generatedAt;
    return run;
  } finally {
    cycleRunning = false;
  }
}

function scheduleWatchdogTimer(settings: MonitorSettings): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  if (!settings.enabled) {
    console.log('[monitor] Системный вотчдог выключен в настройках');
    return;
  }
  currentIntervalSec = settings.intervalSec;
  watchdogTimer = setInterval(() => {
    void runMonitorCycle().catch((err) => {
      console.error('[monitor] cycle failed:', err instanceof Error ? err.message : err);
    });
  }, currentIntervalSec * 1000);
  watchdogTimer.unref?.();
}

async function ensureRuntimeStateTable(): Promise<void> {
  if (!pool || runtimeStateTableEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_monitor_runtime_state (
        id INT PRIMARY KEY DEFAULT 1,
        last_boot_at TIMESTAMPTZ,
        last_boot_pid INT,
        last_boot_host TEXT,
        last_clean_shutdown_at TIMESTAMPTZ,
        last_shutdown_signal TEXT
      )
    `);
    runtimeStateTableEnsured = true;
  } catch {
    // ignore
  }
}

/**
 * Регистрирует запуск процесса и проверяет, завершился ли предыдущий процесс штатно.
 * Если нет (например, OOM killer / segfault / kill -9 / краш контейнера) — оповещает админа!
 */
async function recordBootAndDetectUnexpectedRestart(settings: MonitorSettings): Promise<void> {
  if (!pool) return;
  try {
    await ensureRuntimeStateTable();
    const { rows } = await pool.query<{
      last_boot_at: Date | string | null;
      last_clean_shutdown_at: Date | string | null;
      last_boot_pid: number | null;
    }>(
      `SELECT last_boot_at, last_clean_shutdown_at, last_boot_pid
         FROM system_monitor_runtime_state
        WHERE id = 1`,
    );
    const prev = rows[0];
    const prevBootMs = prev?.last_boot_at ? new Date(prev.last_boot_at).getTime() : 0;
    const prevShutdownMs = prev?.last_clean_shutdown_at
      ? new Date(prev.last_clean_shutdown_at).getTime()
      : 0;
    const wasUnexpectedRestart = prevBootMs > 0 && prevShutdownMs < prevBootMs;

    await pool.query(
      `INSERT INTO system_monitor_runtime_state (id, last_boot_at, last_boot_pid, last_boot_host)
       VALUES (1, NOW(), $1, $2)
       ON CONFLICT (id) DO UPDATE
         SET last_boot_at = NOW(),
             last_boot_pid = EXCLUDED.last_boot_pid,
             last_boot_host = EXCLUDED.last_boot_host`,
      [process.pid, os.hostname()],
    );

    if (wasUnexpectedRestart && settings.notifyOn.restart) {
      const prevBootIso = new Date(prevBootMs).toLocaleString('ru-RU');
      const title = 'Обнаружен аварийный перезапуск сервера';
      const detail = `Предыдущий процесс (PID ${prev?.last_boot_pid ?? '?'}, запуск ${prevBootIso}) завершился без штатной остановки (возможен OOM, падение процесса или перезапуск контейнера). Текущий PID: ${process.pid}.`;
      const outcome = raiseManualAlert('unexpected_restart', 'critical', title, detail);
      if (outcome.shouldNotify) {
        void notifyAdmins({
          title,
          body: detail,
          severity: 'critical',
          kind: 'alert',
          url: '/admin?tab=diagnostics',
          tag: 'system-unexpected-restart',
        });
      }
    }
  } catch (error) {
    console.warn('[monitor] boot state check failed:', error instanceof Error ? error.message : error);
  }
}

/** Помечает штатное завершение (SIGTERM/SIGINT), чтобы плановый деплой не считался падением. */
export async function markCleanShutdown(signal: string): Promise<void> {
  if (!pool) return;
  try {
    await ensureRuntimeStateTable();
    await pool.query(
      `INSERT INTO system_monitor_runtime_state (id, last_clean_shutdown_at, last_shutdown_signal)
       VALUES (1, NOW(), $1)
       ON CONFLICT (id) DO UPDATE
         SET last_clean_shutdown_at = NOW(),
             last_shutdown_signal = EXCLUDED.last_shutdown_signal`,
      [signal],
    );
  } catch {
    // ignore
  }
}

/** Запуск фонового мониторинга (идемпотентный). Вызывается из main.ts после старта БД. */
export function initSystemWatchdog(): void {
  ensureMetricsCollector();
  void (async () => {
    const settings = await loadMonitorSettings(true);
    await hydrateAlertsFromDb();
    await recordBootAndDetectUnexpectedRestart(settings);
    scheduleWatchdogTimer(settings);

    if (settings.enabled) {
      console.log(`[monitor] Системный вотчдог запущен (интервал ${settings.intervalSec} с)`);
      void writeAppLog({
        level: 'info',
        scope: 'monitor',
        event: 'monitor.started',
        message: `Системный мониторинг запущен: интервал ${settings.intervalSec} с`,
        context: { intervalSec: settings.intervalSec },
      });
      // Первый стартовый срез через 5 секунд, чтобы админка сразу видела живые данные.
      const bootProbe = setTimeout(() => {
        void runMonitorCycle().catch((err) => {
          console.warn('[monitor] initial cycle failed:', err instanceof Error ? err.message : err);
        });
      }, 5000);
      bootProbe.unref?.();
    }
  })();
}

/** Обновление настроек мониторинга из админки с немедленным применением к вотчдогу. */
export async function applyMonitorSettingsUpdate(patch: MonitorSettingsPatch): Promise<MonitorSettings> {
  const updated = await updateMonitorSettings(patch);
  scheduleWatchdogTimer(updated);
  return updated;
}

/**
 * Вызывается из HTTP-middleware на каждый ответ 5xx.
 * Если за короткое окно (напр. 60с) накопилось >= N ошибок 5xx — немедленно оповещает админа!
 */
export function onHttp5xx(method: string, path: string, status: number, errorMessage?: string): void {
  const settings = getCachedMonitorSettings();
  if (!settings.enabled || !settings.notifyOn.http5xxBurst) return;
  const { http5xxBurstCount, http5xxBurstWindowSec } = settings.thresholds;
  const burst = getRecent5xxBurst(http5xxBurstWindowSec);
  if (burst.count < http5xxBurstCount) return;

  const title = `Всплеск ошибок HTTP 5xx (${burst.count} за ${http5xxBurstWindowSec}с)`;
  const pathsList = burst.samplePaths.length > 0 ? burst.samplePaths.join(', ') : `${method} ${path} (${status})`;
  const body = [
    `Зафиксировано ${burst.count} серверных ошибок за последние ${http5xxBurstWindowSec} сек.`,
    `Маршруты: ${pathsList}`,
    ...(errorMessage ? [`Последняя ошибка: ${errorMessage.slice(0, 300)}`] : []),
  ].join('\n');

  const outcome = raiseManualAlert('http_5xx_burst', 'critical', title, body);
  if (outcome.shouldNotify && settings.notifyOn.critical) {
    void notifyAdmins({
      title,
      body,
      severity: 'critical',
      kind: 'alert',
      url: '/admin?tab=diagnostics',
      tag: 'system-http-5xx-burst',
    });
  }
}

/** Живой статус для админки: метрики + последний прогон + алерты + каналы + настройки (+ подсистемы). */
export async function getMonitorStatus(includeSubsystems = false): Promise<MonitorStatusResponse> {
  const settings = await loadMonitorSettings();
  // Если вотчдог ещё ни разу не успел прогнать цикл (напр. открыли сразу после старта) — запускаем сейчас.
  if (!lastRun && !cycleRunning) {
    await runMonitorCycle().catch(() => undefined);
  }
  const metrics: MonitorMetricsSnapshot = getMetricsSnapshot();
  const checks = lastRun?.checks ?? [];
  const activeAlerts = getActiveAlerts();
  const [channels, subsystems] = await Promise.all([
    getNotificationChannelsSummary(),
    includeSubsystems ? collectSubsystemInventory() : Promise.resolve(undefined),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    overall: aggregateMonitorStatus(checks, activeAlerts),
    watchdog: {
      enabled: settings.enabled,
      intervalSec: settings.intervalSec,
      lastRunAt,
      lastRun,
    },
    metrics,
    checks,
    activeAlerts,
    alertHistory: getAlertHistory(),
    channels,
    settings,
    ...(subsystems ? { subsystems } : {}),
  };
}

export async function runMonitorNow(): Promise<MonitorRunResult> {
  return runMonitorCycle();
}

export async function sendMonitorTestAlert(): Promise<AdminNotifyResult> {
  return sendTestAlertToAdmins();
}

export function acknowledgeMonitorAlert(key: string, actorName?: string): MonitorAlert | null {
  return acknowledgeAlert(key, actorName);
}

export function resolveMonitorAlert(key: string): MonitorAlert | null {
  return resolveManualAlert(key);
}

/**
 * Уведомление о крахе процесса — для `uncaughtException`.
 * Лучшее усилие с жёстким бюджетом времени 5с, чтобы успеть доставить сигнал админу.
 */
export async function notifyAdminsAboutCrash(kind: string, detail: string): Promise<void> {
  recordUncaughtException();
  const settings = getCachedMonitorSettings();
  const title = `Критический сбой сервера: ${kind}`;
  const body = `Процесс столкнулся с критической ошибкой.\n\n${detail.slice(0, 1200)}\n\nPID: ${process.pid} · Хост: ${os.hostname()}`;
  raiseManualAlert(`crash_${kind}`, 'critical', title, body);

  if (!settings.notifyOn.crash) return;
  const timeout = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);
    timer.unref?.();
  });
  const work = (async () => {
    try {
      await notifyAdmins({
        title,
        body,
        severity: 'critical',
        kind: 'alert',
        url: '/admin?tab=diagnostics',
        tag: 'system-crash',
      });
    } catch {
      // ignore
    }
  })();
  await Promise.race([work, timeout]);
}

/** Фиксация `unhandledRejection` + алерт админу (с дедупликацией и кулдауном). */
export function noteUnhandledRejection(reason: unknown): void {
  recordUnhandledRejection();
  const message = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason);
  const shortMsg = reason instanceof Error ? reason.message : String(reason);
  void writeAppLog({
    level: 'error',
    scope: 'runtime',
    event: 'runtime.unhandled_rejection',
    message: `Необработанная ошибка в фоновом процессе: ${shortMsg.slice(0, 240)}`,
    context: { reason: message.slice(0, 2000) },
  });

  const settings = getCachedMonitorSettings();
  const outcome = raiseManualAlert(
    'unhandled_rejection',
    'warning',
    'Необработанное исключение (unhandledRejection)',
    shortMsg.slice(0, 500),
  );
  if (outcome.shouldNotify && settings.notifyOn.crash) {
    void notifyAdmins({
      title: 'Необработанная ошибка в фоновом процессе',
      body: `${shortMsg.slice(0, 600)}\n\nВсего за аптайм: ${getMetricsSnapshot().unhandledRejections}`,
      severity: 'warning',
      kind: 'alert',
      url: '/admin?tab=diagnostics',
      tag: 'system-unhandled-rejection',
    });
  }
}
