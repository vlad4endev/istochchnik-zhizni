import assert from 'node:assert/strict';

import {
  acknowledgeAlert,
  aggregateMonitorStatus,
  getActiveAlerts,
  getAlertHistory,
  raiseAlert,
  raiseManualAlert,
  resetAlertsForTests,
  resolveAlerts,
  resolveManualAlert,
} from './alerts';
import {
  getCronJobHeartbeats,
  getErrorRateWindow,
  getMetricsSnapshot,
  getRecent5xxBurst,
  normalizeRoutePath,
  percentile,
  readSystemMemoryInfo,
  recordCronHeartbeat,
  recordRequest,
  resetMetricsForTests,
} from './metrics';
import { selectRecipientAdmins } from './notifyAdmins';
import {
  buildDefaultMonitorSettings,
  normalizeMonitorSettings,
  resetSettingsCacheForTests,
} from './settings';
import { buildDeterministicAudit } from '../routes/diagnostics.router';
import type { MonitorCheckResult, ServerDiagnosticResult } from '../types';

function makeCheck(overrides: Partial<MonitorCheckResult>): MonitorCheckResult {
  return {
    id: 'database',
    label: 'PostgreSQL',
    status: 'ok',
    severity: 'critical',
    optional: false,
    details: 'ok',
    durationMs: 5,
    ...overrides,
  };
}

// 1. Route normalization collapses numeric IDs & UUIDs
assert.equal(normalizeRoutePath('GET', '/api/users/42?foo=bar'), 'GET /api/users/:id');
assert.equal(
  normalizeRoutePath('POST', '/api/messenger/conversations/550e8400-e29b-41d4-a716-446655440000/messages'),
  'POST /api/messenger/conversations/:uuid/messages',
);
assert.equal(normalizeRoutePath('get', '/api/songs/123/transpose'), 'GET /api/songs/:id/transpose');

// 2. Percentiles & HTTP telemetry + 5xx burst + cron heartbeats
resetMetricsForTests();
assert.equal(percentile([], 95), 0);
assert.equal(percentile([10, 20, 30, 40, 100], 95), 100);

recordRequest(200, 35, 'GET', '/api/users/1');
recordRequest(200, 45, 'GET', '/api/users/2');
recordRequest(404, 15, 'GET', '/api/songs/999');
recordRequest(500, 210, 'POST', '/api/messenger/messages');
recordRequest(502, 420, 'POST', '/api/messenger/messages');
recordRequest(503, 180, 'GET', '/api/calendar/10');

const snap = getMetricsSnapshot();
assert.equal(snap.requests.total, 6);
assert.equal(snap.requests.errors4xx, 1);
assert.equal(snap.requests.errors5xx, 3);
assert.equal(snap.recentErrors5xx.length, 3);
assert.equal(snap.topErrorEndpoints[0]?.route, 'POST /api/messenger/messages');
assert.equal(snap.topErrorEndpoints[0]?.errors5xx, 2);

const burst = getRecent5xxBurst(60);
assert.equal(burst.count, 3);
assert.ok(burst.samplePaths.length >= 2);

const errWin = getErrorRateWindow(5);
assert.equal(errWin.total, 6);
assert.equal(errWin.errors5xx, 3);
assert.equal(errWin.errorRatePercent, 50);

recordCronHeartbeat('Автобекап БД', true, 1200);
recordCronHeartbeat('Автобекап БД', false, 300, new Error('disk full'));
const crons = getCronJobHeartbeats();
assert.equal(crons.length, 1);
assert.equal(crons[0]?.runs, 2);
assert.equal(crons[0]?.failures, 1);
assert.equal(crons[0]?.ok, false);
assert.match(crons[0]?.lastError ?? '', /disk full/);

// 3. System memory reader returns valid percentage
const sysMem = readSystemMemoryInfo();
assert.ok(sysMem.totalBytes > 0);
assert.ok(sysMem.usagePercent >= 0 && sysMem.usagePercent <= 100);

// 4. Settings normalization & clamping
const defaults = buildDefaultMonitorSettings();
const normalized = normalizeMonitorSettings(
  {
    enabled: true,
    intervalSec: 5, // clamped to 10
    cooldownCriticalMin: 99999, // clamped to 1440
    notifyChannels: {
      push: false,
      telegram: true,
      webhookUrl: 'not-a-valid-url',
    },
    thresholds: {
      diskWarnPercent: 80,
      diskFailPercent: 70, // fail < warn should be clamped safely
    },
    mutedChecks: ['redis', 'redis', '  '],
  },
  defaults,
);
assert.equal(normalized.intervalSec, 10);
assert.equal(normalized.cooldownCriticalMin, 1440);
assert.equal(normalized.notifyChannels.push, false);
assert.equal(normalized.notifyChannels.webhookUrl, null);
assert.ok(normalized.thresholds.diskFailPercent >= normalized.thresholds.diskWarnPercent);
assert.deepEqual(normalized.mutedChecks, ['redis']);

// 4b. Recipient admin selection
assert.equal(defaults.recipientAdminIds, null);
assert.equal(normalizeMonitorSettings({}, defaults).recipientAdminIds, null);
assert.deepEqual(
  normalizeMonitorSettings({ recipientAdminIds: [3, '5', 3, -1, 'x', 0] }, defaults).recipientAdminIds,
  [3, 5],
);
assert.deepEqual(normalizeMonitorSettings({ recipientAdminIds: [] }, defaults).recipientAdminIds, []);
assert.equal(normalizeMonitorSettings({ recipientAdminIds: null }, defaults).recipientAdminIds, null);
const adminPool = [
  { memberId: 1, name: 'A', telegramChatId: null },
  { memberId: 2, name: 'B', telegramChatId: '10' },
  { memberId: 3, name: 'C', telegramChatId: null },
];
assert.equal(selectRecipientAdmins(adminPool, null).length, 3);
assert.deepEqual(
  selectRecipientAdmins(adminPool, [2, 99]).map((a) => a.memberId),
  [2],
);
assert.equal(selectRecipientAdmins(adminPool, []).length, 0);

// 5. Alert lifecycle: dedup, cooldown, escalation, ack, resolve, mute
resetAlertsForTests();
resetSettingsCacheForTests({
  cooldownCriticalMin: 30,
  cooldownWarningMin: 60,
  mutedChecks: ['redis'],
});

const dbWarn = makeCheck({ id: 'database', status: 'warn', severity: 'warning', details: 'Slow 900ms' });
const r1 = raiseAlert(dbWarn, 'Медленная БД', dbWarn.details);
assert.equal(r1.shouldNotify, true);
assert.equal(r1.alert.occurrences, 1);
assert.equal(getActiveAlerts().length, 1);

// Same warning immediately again -> deduplicated, cooldown blocks re-notification
const r2 = raiseAlert(dbWarn, 'Медленная БД', dbWarn.details);
assert.equal(r2.shouldNotify, false);
assert.equal(r2.alert.occurrences, 2);

// Escalate warning -> critical -> must notify immediately
const dbFail = makeCheck({ id: 'database', status: 'fail', severity: 'critical', details: 'Connection refused' });
const r3 = raiseAlert(dbFail, 'БД недоступна', dbFail.details);
assert.equal(r3.shouldNotify, true);
assert.equal(r3.alert.severity, 'critical');

// Acknowledge keeps it visible as acknowledged
const acked = acknowledgeAlert('database', 'admin#1');
assert.equal(acked?.status, 'acknowledged');
assert.equal(acked?.acknowledgedBy, 'admin#1');

// Muted check still records alert in UI, but suppresses external notification
const redisFail = makeCheck({ id: 'redis', label: 'Redis', status: 'fail', severity: 'warning', optional: true });
const rMuted = raiseAlert(redisFail, 'Redis недоступен', 'Timeout');
assert.equal(rMuted.shouldNotify, false);

// Resolve on healthy check
const resolved = resolveAlerts([
  makeCheck({ id: 'database', status: 'ok' }),
  makeCheck({ id: 'redis', status: 'ok' }),
]);
assert.equal(resolved.length, 2);
assert.equal(getActiveAlerts().length, 0);
assert.ok(getAlertHistory().length >= 2);

// Manual alert raise & resolve
const manual = raiseManualAlert('http_5xx_burst', 'critical', 'Всплеск 5xx', '10 ошибок за 60с');
assert.equal(manual.shouldNotify, true);
assert.equal(getActiveAlerts().length, 1);
const closedManual = resolveManualAlert('http_5xx_burst');
assert.equal(closedManual?.status, 'resolved');
assert.equal(getActiveAlerts().length, 0);

// 6. Aggregate status logic
assert.equal(aggregateMonitorStatus([makeCheck({ status: 'ok' })]), 'healthy');
assert.equal(
  aggregateMonitorStatus([makeCheck({ status: 'warn', severity: 'warning' })]),
  'degraded',
);
assert.equal(
  aggregateMonitorStatus([makeCheck({ status: 'fail', severity: 'critical', optional: false })]),
  'critical',
);
assert.equal(
  aggregateMonitorStatus([makeCheck({ id: 'redis', status: 'skip', optional: true })]),
  'healthy',
);

// 7. Deterministic audit engine computes real score without Anthropic
const fakeServer: ServerDiagnosticResult = {
  timestamp: new Date().toISOString(),
  cpu: { usagePercent: 12.5, sampledOverMs: 100 },
  memory: { totalBytes: 8e9, freeBytes: 4e9, usedBytes: 4e9, usagePercent: 50 },
  disk: { filesystem: '/dev/sda1', totalKb: 1e8, usedKb: 4e7, availableKb: 6e7, usagePercent: 40, mountPoint: '/' },
  runtime: {
    nodeVersion: process.version,
    pid: process.pid,
    platform: 'linux',
    env: 'test',
    processUptimeSec: 120,
    systemUptimeSec: 3600,
    loadAverage: [0.5, 0.4, 0.3],
  },
  recommendations: [],
};

const healthyAudit = buildDeterministicAudit({
  description: 'Healthy test',
  checks: [{ name: 'DB', status: 'passed', details: 'ok', durationMs: 5 }],
  server: fakeServer,
  eventLoopLagMs: 5,
  errorRate: 0,
  p95Ms: 80,
});
assert.equal(healthyAudit.overallScore, 100);
assert.equal(healthyAudit.issues.length, 0);

const failingAudit = buildDeterministicAudit({
  description: 'Degraded test',
  checks: [{ name: 'Database connectivity', status: 'failed', details: 'down', durationMs: 5 }],
  server: {
    ...fakeServer,
    disk: { ...fakeServer.disk!, usagePercent: 95 },
  },
  eventLoopLagMs: 450,
  errorRate: 0.25,
  p95Ms: 2200,
});
assert.ok(failingAudit.overallScore < 50, `Expected score < 50, got ${failingAudit.overallScore}`);
assert.ok(failingAudit.issues.some((i) => i.severity === 'CRITICAL'));
assert.ok(failingAudit.recommendations.length >= 3);

console.log('monitor.test.ts: all assertions passed');
