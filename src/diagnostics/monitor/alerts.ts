import { pool } from '../../config/db';
import { writeAppLog } from '../../services/appLogService';
import type { AlertSeverity, MonitorAlert, MonitorCheckResult, MonitorOverallStatus } from '../types';
import { getCachedMonitorSettings } from './settings';

/**
 * Движок алертов с дедупликацией, кулдаунами, эскалацией, ack/resolve
 * и персистентным хранением в PostgreSQL (`system_monitor_alerts`), чтобы
 * история инцидентов и крашей переживала рестарт сервера.
 * При недоступной БД прозрачно работает в памяти.
 */

const ALERT_HISTORY_LIMIT = 200;

function cooldownMsFor(severity: AlertSeverity): number {
  const settings = getCachedMonitorSettings();
  const minutes =
    severity === 'critical' ? settings.cooldownCriticalMin : settings.cooldownWarningMin;
  return Math.max(0, minutes) * 60 * 1000;
}

const activeAlerts = new Map<string, MonitorAlert>();
const alertHistory: MonitorAlert[] = [];
let schemaEnsured = false;

async function ensureAlertsSchema(): Promise<void> {
  if (!pool || schemaEnsured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_monitor_alerts (
        id BIGSERIAL PRIMARY KEY,
        alert_key TEXT NOT NULL,
        check_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        occurrences INT NOT NULL DEFAULT 1,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by TEXT,
        resolved_at TIMESTAMPTZ,
        last_notified_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_sys_mon_alerts_key_status
        ON system_monitor_alerts (alert_key, status);
      CREATE INDEX IF NOT EXISTS idx_sys_mon_alerts_last_seen
        ON system_monitor_alerts (last_seen_at DESC);
    `);
    schemaEnsured = true;
  } catch (error) {
    console.warn('[monitor] Не удалось создать таблицу system_monitor_alerts:', error instanceof Error ? error.message : error);
  }
}

async function persistAlertUpsert(alert: MonitorAlert): Promise<void> {
  if (!pool) return;
  try {
    await ensureAlertsSchema();
    const { rowCount } = await pool.query(
      `UPDATE system_monitor_alerts
          SET severity = $2,
              title = $3,
              message = $4,
              status = $5,
              occurrences = $6,
              last_seen_at = $7::timestamptz,
              acknowledged_at = $8::timestamptz,
              acknowledged_by = $9,
              resolved_at = $10::timestamptz,
              last_notified_at = $11::timestamptz
        WHERE id = (
          SELECT id FROM system_monitor_alerts
           WHERE alert_key = $1 AND status IN ('active', 'acknowledged')
           ORDER BY id DESC LIMIT 1
        )`,
      [
        alert.key,
        alert.severity,
        alert.title,
        alert.message,
        alert.status,
        alert.occurrences,
        alert.lastSeenAt,
        alert.acknowledgedAt ?? null,
        alert.acknowledgedBy ?? null,
        alert.resolvedAt ?? null,
        alert.lastNotifiedAt ?? null,
      ],
    );
    if (!rowCount) {
      await pool.query(
        `INSERT INTO system_monitor_alerts (
          alert_key, check_id, severity, title, message, status, occurrences,
          first_seen_at, last_seen_at, acknowledged_at, acknowledged_by, resolved_at, last_notified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz, $11, $12::timestamptz, $13::timestamptz)`,
        [
          alert.key,
          alert.checkId,
          alert.severity,
          alert.title,
          alert.message,
          alert.status,
          alert.occurrences,
          alert.firstSeenAt,
          alert.lastSeenAt,
          alert.acknowledgedAt ?? null,
          alert.acknowledgedBy ?? null,
          alert.resolvedAt ?? null,
          alert.lastNotifiedAt ?? null,
        ],
      );
    }
  } catch {
    // БД может быть сама причиной алерта — не зацикливаем ошибки.
  }
}

/** Загружает активные и недавние инциденты из PostgreSQL при старте сервера. */
export async function hydrateAlertsFromDb(): Promise<void> {
  if (!pool) return;
  try {
    await ensureAlertsSchema();
    const { rows } = await pool.query<{
      alert_key: string;
      check_id: string;
      severity: string;
      title: string;
      message: string;
      status: string;
      occurrences: number;
      first_seen_at: Date | string;
      last_seen_at: Date | string;
      acknowledged_at: Date | string | null;
      acknowledged_by: string | null;
      resolved_at: Date | string | null;
      last_notified_at: Date | string | null;
    }>(
      `SELECT alert_key, check_id, severity, title, message, status, occurrences,
              first_seen_at, last_seen_at, acknowledged_at, acknowledged_by, resolved_at, last_notified_at
         FROM system_monitor_alerts
        ORDER BY last_seen_at DESC
        LIMIT 120`,
    );

    const toIso = (v: Date | string | null): string | undefined => {
      if (!v) return undefined;
      return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
    };

    alertHistory.length = 0;
    for (const row of rows.reverse()) {
      const alert: MonitorAlert = {
        key: row.alert_key,
        checkId: row.check_id,
        severity: row.severity === 'critical' ? 'critical' : 'warning',
        title: row.title,
        message: row.message,
        status:
          row.status === 'resolved'
            ? 'resolved'
            : row.status === 'acknowledged'
              ? 'acknowledged'
              : 'active',
        occurrences: Number(row.occurrences) || 1,
        firstSeenAt: toIso(row.first_seen_at) ?? new Date().toISOString(),
        lastSeenAt: toIso(row.last_seen_at) ?? new Date().toISOString(),
        acknowledgedAt: toIso(row.acknowledged_at),
        acknowledgedBy: row.acknowledged_by ?? undefined,
        resolvedAt: toIso(row.resolved_at),
        lastNotifiedAt: toIso(row.last_notified_at),
      };
      pushHistory(alert);
      if (alert.status === 'active' || alert.status === 'acknowledged') {
        activeAlerts.set(alert.key, alert);
      }
    }
  } catch (error) {
    console.warn('[monitor] Не удалось загрузить историю алертов из БД:', error instanceof Error ? error.message : error);
  }
}

export function getActiveAlerts(): MonitorAlert[] {
  return [...activeAlerts.values()].sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt);
  });
}

export function getAlertHistory(): MonitorAlert[] {
  return [...alertHistory].slice(-ALERT_HISTORY_LIMIT).reverse();
}

export function resetAlertsForTests(): void {
  activeAlerts.clear();
  alertHistory.length = 0;
  schemaEnsured = false;
}

export interface AlertRaiseOutcome {
  alert: MonitorAlert;
  /** true — уведомление должно быть отправлено (новый алерт, эскалация или истёк кулдаун). */
  shouldNotify: boolean;
}

export function isCheckMuted(checkId: string): boolean {
  const settings = getCachedMonitorSettings();
  return settings.mutedChecks.includes(checkId);
}

/**
 * Фиксирует провал проверки. Повторяющиеся провалы не спамят админа:
 * уведомление уходит при первом срабатывании, при эскалации warning→critical или после кулдауна.
 * Принятые (acknowledged) алерты не повторяют уведомления до эскалации.
 */
export function raiseAlert(
  check: MonitorCheckResult,
  title: string,
  message: string,
  severityOverride?: AlertSeverity,
): AlertRaiseOutcome {
  const now = new Date().toISOString();
  const severity = severityOverride ?? check.severity;
  const muted = isCheckMuted(check.id);
  const existing = activeAlerts.get(check.id);

  if (existing) {
    existing.lastSeenAt = now;
    existing.occurrences += 1;
    let escalated = false;
    if (severity === 'critical' && existing.severity !== 'critical') {
      existing.severity = 'critical';
      escalated = true;
      if (existing.status === 'acknowledged') {
        existing.status = 'active';
      }
    }
    if (existing.message !== message) {
      existing.message = message;
    }
    const cooldown = cooldownMsFor(existing.severity);
    const lastNotified = existing.lastNotifiedAt ? Date.parse(existing.lastNotifiedAt) : 0;
    const cooldownExpired = !Number.isFinite(lastNotified) || Date.now() - lastNotified >= cooldown;
    const shouldNotify =
      !muted && (escalated || (existing.status === 'active' && cooldownExpired));
    if (shouldNotify) existing.lastNotifiedAt = now;
    pushHistory(existing);
    void persistAlertUpsert(existing);
    return { alert: existing, shouldNotify };
  }

  const alert: MonitorAlert = {
    key: check.id,
    checkId: check.id,
    severity,
    title,
    message,
    firstSeenAt: now,
    lastSeenAt: now,
    occurrences: 1,
    status: 'active',
    lastNotifiedAt: muted ? undefined : now,
  };
  activeAlerts.set(check.id, alert);
  pushHistory(alert);
  void persistAlertUpsert(alert);
  void writeAppLog({
    level: severity === 'critical' ? 'error' : 'warn',
    scope: 'monitor',
    event: 'monitor.alert_raised',
    message: `ALERT [${severity}] ${title}: ${message}`,
    context: { checkId: check.id, severity, details: check.details, muted },
  });
  return { alert, shouldNotify: !muted };
}

/**
 * Резолвит алерты, чьи проверки снова прошли. Возвращает список
 * восстановленных алертов, по которым нужно отправить «resolved»-уведомление.
 */
export function resolveAlerts(checks: MonitorCheckResult[]): MonitorAlert[] {
  const resolved: MonitorAlert[] = [];
  for (const check of checks) {
    const alert = activeAlerts.get(check.id);
    if (!alert) continue;
    if (check.status === 'ok' || check.status === 'skip') {
      const now = new Date().toISOString();
      alert.status = 'resolved';
      alert.resolvedAt = now;
      activeAlerts.delete(check.id);
      pushHistory(alert);
      resolved.push(alert);
      void persistAlertUpsert(alert);
      void writeAppLog({
        level: 'info',
        scope: 'monitor',
        event: 'monitor.alert_resolved',
        message: `RESOLVED ${alert.title}`,
        context: { checkId: alert.checkId, firstSeenAt: alert.firstSeenAt, occurrences: alert.occurrences },
      });
    }
  }
  return resolved;
}

/** Помечает активный алерт как «принятый в работу» администратором (останавливает повторные напоминания). */
export function acknowledgeAlert(key: string, actorName = 'admin'): MonitorAlert | null {
  const alert = activeAlerts.get(key);
  if (!alert) return null;
  alert.status = 'acknowledged';
  alert.acknowledgedAt = new Date().toISOString();
  alert.acknowledgedBy = actorName;
  pushHistory(alert);
  void persistAlertUpsert(alert);
  void writeAppLog({
    level: 'info',
    scope: 'monitor',
    event: 'monitor.alert_acknowledged',
    message: `ACK ${alert.title} (${actorName})`,
    context: { key, actorName },
  });
  return alert;
}

/** Алерт вне набора проверок (краш, всплеск 5xx, неожиданный рестарт). */
export function raiseManualAlert(
  key: string,
  severity: AlertSeverity,
  title: string,
  message: string,
): AlertRaiseOutcome {
  return raiseAlert(
    { id: key, label: title, status: 'fail', severity, optional: false, details: message, durationMs: 0 },
    title,
    message,
    severity,
  );
}

export function resolveManualAlert(key: string): MonitorAlert | null {
  const alert = activeAlerts.get(key);
  if (!alert) return null;
  const now = new Date().toISOString();
  alert.status = 'resolved';
  alert.resolvedAt = now;
  activeAlerts.delete(key);
  pushHistory(alert);
  void persistAlertUpsert(alert);
  return alert;
}

function pushHistory(alert: MonitorAlert): void {
  // Обновляем последнюю запись с тем же ключом и firstSeenAt, чтобы история не раздувалась дублями одного инцидента.
  const idx = alertHistory.findIndex(
    (item) => item.key === alert.key && item.firstSeenAt === alert.firstSeenAt,
  );
  if (idx >= 0) {
    alertHistory[idx] = { ...alert };
  } else {
    alertHistory.push({ ...alert });
    while (alertHistory.length > ALERT_HISTORY_LIMIT) alertHistory.shift();
  }
}

/**
 * Общий статус системы: любой провал обязательной проверки или активный critical-алерт → critical,
 * предупреждение, принятый алерт или провал опциональной интеграции → degraded.
 */
export function aggregateMonitorStatus(
  checks: MonitorCheckResult[],
  activeAlertsList: MonitorAlert[] = getActiveAlerts(),
): MonitorOverallStatus {
  const criticalFail = checks.some(
    (c) => c.status === 'fail' && !c.optional && c.severity === 'critical' && !isCheckMuted(c.id),
  );
  const criticalAlert = activeAlertsList.some(
    (a) => a.severity === 'critical' && a.status === 'active' && !isCheckMuted(a.checkId),
  );
  if (criticalFail || criticalAlert) return 'critical';
  const degraded = checks.some(
    (c) => (c.status === 'warn' || (c.status === 'fail' && c.optional)) && !isCheckMuted(c.id),
  );
  const anyAlert = activeAlertsList.some((a) => !isCheckMuted(a.checkId));
  if (degraded || anyAlert) return 'degraded';
  return 'healthy';
}
