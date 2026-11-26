import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LuActivity,
  LuBell,
  LuBellOff,
  LuBellRing,
  LuCircleCheck,
  LuCircleX,
  LuClock,
  LuCpu,
  LuDatabase,
  LuFlaskConical,
  LuHardDrive,
  LuLayers,
  LuPlay,
  LuRefreshCw,
  LuSave,
  LuSend,
  LuServer,
  LuShieldAlert,
  LuShieldCheck,
  LuSparkles,
  LuTriangleAlert,
} from 'react-icons/lu';
import { apiClient } from '../../lib/apiClient';

// ─── Types (mirrored from backend src/diagnostics/types.ts) ──────────────

type MonitorCheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
type AlertSeverity = 'critical' | 'warning';
type MonitorOverallStatus = 'healthy' | 'degraded' | 'critical';

type MonitorCheckResult = {
  id: string;
  label: string;
  category?: string;
  status: MonitorCheckStatus;
  severity: AlertSeverity;
  optional: boolean;
  details: string;
  value?: number;
  durationMs: number;
  threshold?: { warn: number; fail: number; unit: string };
};

type EndpointMetricSummary = {
  route: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
  lastSeenAt: string;
};

type RecentError5xxSample = {
  at: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  message?: string;
};

type MonitorMinutePoint = {
  minuteStart: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  errorRatePercent: number;
  p95Ms: number;
};

type MonitorMetricsSnapshot = {
  timestamp: string;
  processUptimeSec: number;
  nodeVersion: string;
  pid: number;
  env: string;
  cpuCores: number;
  loadAverage: number[];
  requests: {
    total: number;
    errors4xx: number;
    errors5xx: number;
    perMinute: number;
    errorRatePercent: number;
    latency: { p50Ms: number; p95Ms: number; p99Ms: number; avgMs: number };
  };
  eventLoop: { lagMs: number; maxLagMs: number; p95LagMs: number };
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    heapLimitBytes: number;
    externalBytes: number;
    usagePercent: number;
  };
  systemMemory: {
    totalBytes: number;
    availableBytes: number;
    freeBytes: number;
    usagePercent: number;
    source: 'proc_meminfo' | 'os_freemem';
  };
  unhandledRejections: number;
  uncaughtExceptions: number;
  minuteHistory: MonitorMinutePoint[];
  topErrorEndpoints: EndpointMetricSummary[];
  slowestEndpoints: EndpointMetricSummary[];
  recentErrors5xx: RecentError5xxSample[];
};

type MonitorAlert = {
  key: string;
  checkId: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  status: 'active' | 'acknowledged' | 'resolved';
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  lastNotifiedAt?: string;
};

type MonitorThresholds = {
  eventLoopWarnMs: number;
  eventLoopFailMs: number;
  heapWarnPercent: number;
  heapFailPercent: number;
  systemMemWarnPercent: number;
  systemMemFailPercent: number;
  diskWarnPercent: number;
  diskFailPercent: number;
  latencyP95WarnMs: number;
  latencyP95FailMs: number;
  errorRateWindowMin: number;
  errorRateWarnPercent: number;
  errorRateFailPercent: number;
  dbLatencyWarnMs: number;
  http5xxBurstCount: number;
  http5xxBurstWindowSec: number;
};

type MonitorSettings = {
  enabled: boolean;
  intervalSec: number;
  notifyChannels: {
    push: boolean;
    telegram: boolean;
    webhookUrl: string | null;
  };
  telegramOpsChatId: string | null;
  notifyOn: {
    critical: boolean;
    warning: boolean;
    recovery: boolean;
    crash: boolean;
    http5xxBurst: boolean;
    restart: boolean;
  };
  thresholds: MonitorThresholds;
  cooldownCriticalMin: number;
  cooldownWarningMin: number;
  mutedChecks: string[];
};

type MonitorChannelsSummary = {
  telegramConfigured: boolean;
  telegramEnabledInSettings: boolean;
  telegramOpsChatConfigured: boolean;
  pushConfigured: boolean;
  vapidReady: boolean;
  fcmReady: boolean;
  webhookConfigured: boolean;
  adminTargets: number;
  adminsWithTelegram: number;
  adminsWithPush: number;
};

type CronJobHeartbeat = {
  name: string;
  lastRunAt: string;
  ok: boolean;
  durationMs: number;
  runs: number;
  failures: number;
  lastError?: string;
};

type SubsystemItem = {
  id: string;
  name: string;
  status: MonitorCheckStatus;
  configured: boolean;
  summary: string;
  latencyMs?: number;
  metrics: Record<string, string | number | boolean | null>;
  warnings?: string[];
};

type SubsystemInventory = {
  collectedAt: string;
  durationMs: number;
  items: SubsystemItem[];
  cronJobs: CronJobHeartbeat[];
};

type MonitorStatusResponse = {
  generatedAt: string;
  overall: MonitorOverallStatus;
  watchdog: {
    enabled: boolean;
    intervalSec: number;
    lastRunAt: string | null;
  };
  metrics: MonitorMetricsSnapshot;
  checks: MonitorCheckResult[];
  activeAlerts: MonitorAlert[];
  alertHistory: MonitorAlert[];
  channels: MonitorChannelsSummary;
  settings: MonitorSettings;
  subsystems?: SubsystemInventory;
};

type TestAlertResult = {
  pushSent: number;
  pushFailed: number;
  telegramSent: number;
  telegramFailed: number;
  webhookSent: boolean;
  webhookError?: string;
  adminCount: number;
  errors: string[];
};

type AutomatedTestsPayload = {
  generatedAt: string;
  baseUrl: string;
  durationMs: number;
  summary: { passed: number; failed: number; skipped: number; total: number };
  overall: 'passed' | 'degraded' | 'failed';
  authenticatedContext: boolean;
  results: Array<{
    id: string;
    name: string;
    category: string;
    tier: 'critical' | 'standard' | 'optional';
    status: 'passed' | 'failed' | 'skipped';
    durationMs: number;
    message: string;
    detail?: string;
    httpStatus?: number;
    responsePreview?: string;
  }>;
  smokeEndpoints: Array<{ path: string; ok: boolean; status: number; durationMs: number; note?: string }>;
};

type FailureAnalysisPayload = {
  generatedAt: string;
  executiveSummary: string;
  items: Array<{
    testId: string;
    likelyRootCause: string;
    evidence: string;
    recommendedSteps: string[];
    severity: 'blocking' | 'high' | 'medium' | 'low';
  }>;
  fallback?: boolean;
  errorHint?: string;
};

type FullReportPayload = {
  generatedAt: string;
  readiness: {
    overall: MonitorOverallStatus;
    checks: Array<{ name: string; status: 'passed' | 'warning' | 'failed'; details: string; durationMs: number }>;
  };
  automatedTests: AutomatedTestsPayload;
  server: {
    cpu?: { usagePercent?: number };
    memory?: { usagePercent?: number; usedBytes?: number; totalBytes?: number };
    disk?: { usagePercent?: number; usedKb?: number; totalKb?: number } | null;
    runtime?: { env?: string; nodeVersion?: string; pid?: number; processUptimeSec?: number };
    recommendations?: string[];
  };
  project: {
    filesScanned: number;
    directoriesScanned: number;
    linesOfCode: number;
    hasTests?: boolean;
    packageDependenciesCount: number;
    packageDevDependenciesCount: number;
  };
  performance: {
    eventLoopLagMs: number;
    healthCheckMs: number;
    serverCheckMs: number;
    scanCheckMs: number;
    httpDurationP95Ms: number;
  };
  environment: {
    criticalEnv: Array<{ key: string; present: boolean }>;
    missingCritical: string[];
  };
  journal: {
    total: number;
    byLevel: { info: number; warn: number; error: number };
    topEvents: Array<{ event: string; count: number }>;
    recentErrors: Array<{ message: string; created_at: string; scope: string }>;
  };
  audit: {
    overallScore: number;
    summary: string;
    recommendations: string[];
    issues: Array<{
      id: string;
      severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      title: string;
      description: string;
      suggestion: string;
    }>;
  };
  releaseValidation: {
    pass: boolean;
    blockers: string[];
  };
  regression: {
    hasRegression: boolean;
    items: string[];
    previous?: {
      generatedAt: string;
      httpDurationP95Ms: number;
      errorRate: number;
    };
  };
  truthfulnessNote: string;
};

type SubTabId = 'live' | 'subsystems' | 'tests' | 'alerts';

// ─── Formatting Helpers ──────────────────────────────────────────────────

function formatUptime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м ${s % 60}с`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function formatTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDateTimeRu(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function statusPillClasses(status: MonitorCheckStatus | 'passed' | 'warning' | 'failed' | 'skipped'): string {
  switch (status) {
    case 'ok':
    case 'passed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'warn':
    case 'warning':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'fail':
    case 'failed':
      return 'bg-red-100 text-red-800 border-red-200';
    default:
      return 'bg-stone-100 text-stone-600 border-stone-200';
  }
}

function statusLabelRu(status: MonitorCheckStatus): string {
  if (status === 'ok') return 'Норма';
  if (status === 'warn') return 'Внимание';
  if (status === 'fail') return 'Сбой';
  return 'Выкл / нет';
}

function metricLabelRu(key: string): string {
  const dict: Record<string, string> = {
    version: 'Версия',
    dbSizeMb: 'Размер БД (MB)',
    activeConnections: 'Активные соед.',
    idleConnections: 'Свободные соед.',
    totalConnections: 'Всего соед.',
    maxConnections: 'Лимит соед.',
    poolTotal: 'Пул всего',
    poolIdle: 'Пул idle',
    poolWaiting: 'В очереди пула',
    longRunningQueries: 'Долгие запросы >5с',
    blockedQueries: 'Блокировки',
    membersCount: 'Участники',
    messagesCount: 'Сообщения',
    songsCount: 'Песни',
    connectedSockets: 'WS сокетов',
    onlineMembers: 'Онлайн людей',
    activeRooms: 'Комнат',
    redisFanout: 'Redis fanout',
    usedMemoryMb: 'Память (MB)',
    connectedClients: 'Клиенты',
    enabled: 'Включён',
    hasToken: 'Токен',
    sent24h: 'Отправлено (24ч)',
    failed24h: 'Ошибок (24ч)',
    proxyEnabled: 'Прокси',
    vapidReady: 'VAPID (Web)',
    fcmReady: 'FCM (Native)',
    webSubscriptions: 'Web подписок',
    nativeTokens: 'Native токенов',
    provider: 'Провайдер',
    model: 'Модель',
    hasApiKey: 'API ключ',
    autoEnabled: 'Автобекап',
    localCount: 'Лок. архивов',
    lastBackupAgeHours: 'Возраст бекапа (ч)',
    lastStatus: 'Последний статус',
    driveConnected: 'Google Drive',
    activeSessions: 'Активные сессии',
    encryptionKeySet: 'Ключ шифрования',
    usagePercent: 'Занято (%)',
    availableGb: 'Свободно (GB)',
    uploadsWritable: 'Запись uploads',
    roomsCount: 'Комнат LiveKit',
  };
  return dict[key] ?? key;
}

function formatMetricValue(v: string | number | boolean | null): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Да' : 'Нет';
  return String(v);
}

// ─── Inline SVG Sparkline ────────────────────────────────────────────────

function MiniSparkline({
  values,
  color,
  fillColor,
  unit,
  label,
}: {
  values: number[];
  color: string;
  fillColor: string;
  unit: string;
  label: string;
}) {
  const safeValues = values.length >= 2 ? values : [0, ...(values.length ? values : [0])];
  const max = Math.max(...safeValues, 1);
  const current = safeValues[safeValues.length - 1] ?? 0;
  const peak = Math.max(...safeValues);
  const width = 260;
  const height = 54;
  const pad = 4;

  const points = safeValues.map((val, idx) => {
    const x = pad + (idx / (safeValues.length - 1)) * (width - pad * 2);
    const y = height - pad - (val / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = points.join(' ');
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-3.5 shadow-sm">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-stone-600">{label}</span>
        <span className="text-xs text-stone-400">
          пик: <strong className="text-stone-700">{peak}{unit}</strong> · сейчас:{' '}
          <strong className="text-stone-900">{current}{unit}</strong>
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible">
        <polygon points={area} fill={fillColor} />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={polyline}
        />
      </svg>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function DiagnosticsDashboardSection() {
  const [activeTab, setActiveTab] = useState<SubTabId>('live');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [monitor, setMonitor] = useState<MonitorStatusResponse | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(true);
  const [runningNow, setRunningNow] = useState(false);

  const [subsystems, setSubsystems] = useState<SubsystemInventory | null>(null);
  const [subsystemsLoading, setSubsystemsLoading] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState<MonitorSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);

  const [testAlertLoading, setTestAlertLoading] = useState(false);
  const [testAlertResult, setTestAlertResult] = useState<TestAlertResult | null>(null);

  const [alertActionKey, setAlertActionKey] = useState<string | null>(null);

  const [report, setReport] = useState<FullReportPayload | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [description, setDescription] = useState('Полный аудит здоровья, безопасности и производительности');

  const [autoSuite, setAutoSuite] = useState<AutomatedTestsPayload | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [testFilter, setTestFilter] = useState<'all' | 'failed' | 'passed' | 'skipped'>('all');

  const [failureAnalysis, setFailureAnalysis] = useState<FailureAnalysisPayload | null>(null);
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false);

  const [errorText, setErrorText] = useState<string | null>(null);

  const fetchMonitorStatus = useCallback(async (quiet = false) => {
    if (!quiet) setMonitorLoading(true);
    try {
      const res = await apiClient.get<MonitorStatusResponse>('/api/diagnostics/monitor/status');
      setMonitor(res.data);
      setSettingsDraft((prev) => prev ?? res.data.settings);
      if (res.data.subsystems) {
        setSubsystems(res.data.subsystems);
      }
      setErrorText(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось загрузить статус мониторинга');
    } finally {
      if (!quiet) setMonitorLoading(false);
    }
  }, []);

  const fetchSubsystems = useCallback(async () => {
    setSubsystemsLoading(true);
    try {
      const res = await apiClient.get<SubsystemInventory>('/api/diagnostics/subsystems');
      setSubsystems(res.data);
      setErrorText(null);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось просканировать подсистемы');
    } finally {
      setSubsystemsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMonitorStatus(false);
  }, [fetchMonitorStatus]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void fetchMonitorStatus(true);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, fetchMonitorStatus]);

  useEffect(() => {
    if (activeTab === 'subsystems' && !subsystems && !subsystemsLoading) {
      void fetchSubsystems();
    }
  }, [activeTab, subsystems, subsystemsLoading, fetchSubsystems]);

  async function handleRunMonitorNow() {
    setRunningNow(true);
    setErrorText(null);
    try {
      await apiClient.post('/api/diagnostics/monitor/run');
      await fetchMonitorStatus(true);
      if (activeTab === 'subsystems') {
        await fetchSubsystems();
      }
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось выполнить проверку');
    } finally {
      setRunningNow(false);
    }
  }

  async function handleAckAlert(key: string) {
    setAlertActionKey(key);
    try {
      await apiClient.post(`/api/diagnostics/monitor/alerts/${encodeURIComponent(key)}/acknowledge`);
      await fetchMonitorStatus(true);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось подтвердить алерт');
    } finally {
      setAlertActionKey(null);
    }
  }

  async function handleResolveAlert(key: string) {
    setAlertActionKey(key);
    try {
      await apiClient.post(`/api/diagnostics/monitor/alerts/${encodeURIComponent(key)}/resolve`);
      await fetchMonitorStatus(true);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось закрыть алерт');
    } finally {
      setAlertActionKey(null);
    }
  }

  async function handleSendTestAlert() {
    setTestAlertLoading(true);
    setTestAlertResult(null);
    setErrorText(null);
    try {
      const res = await apiClient.post<TestAlertResult>('/api/diagnostics/monitor/test-alert');
      setTestAlertResult(res.data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось отправить тестовое оповещение');
    } finally {
      setTestAlertLoading(false);
    }
  }

  async function handleSaveSettings() {
    if (!settingsDraft) return;
    setSavingSettings(true);
    setSettingsSavedMsg(null);
    setErrorText(null);
    try {
      const res = await apiClient.patch<MonitorSettings>(
        '/api/diagnostics/monitor/settings',
        settingsDraft,
      );
      setSettingsDraft(res.data);
      setSettingsSavedMsg('Настройки мониторинга и оповещений сохранены');
      await fetchMonitorStatus(true);
      window.setTimeout(() => setSettingsSavedMsg(null), 4000);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось сохранить настройки');
    } finally {
      setSavingSettings(false);
    }
  }

  async function runAutoTestsOnly() {
    setAutoLoading(true);
    setErrorText(null);
    setFailureAnalysis(null);
    setActiveTab('tests');
    try {
      const res = await apiClient.post<AutomatedTestsPayload>('/api/diagnostics/auto-tests');
      setAutoSuite(res.data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось выполнить автотесты');
    } finally {
      setAutoLoading(false);
    }
  }

  async function runFullAnalysis() {
    setReportLoading(true);
    setErrorText(null);
    setFailureAnalysis(null);
    setActiveTab('tests');
    try {
      const res = await apiClient.post<FullReportPayload>('/api/diagnostics/full-report', {
        description,
      });
      setReport(res.data);
      setAutoSuite(res.data.automatedTests);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось сформировать полный отчёт');
    } finally {
      setReportLoading(false);
    }
  }

  async function runAiFailureAnalysis() {
    if (!autoSuite) return;
    setAiAnalyzeLoading(true);
    setErrorText(null);
    try {
      const res = await apiClient.post<FailureAnalysisPayload>(
        '/api/diagnostics/auto-tests/analyze-failures',
        { automatedTests: autoSuite },
      );
      setFailureAnalysis(res.data);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Не удалось выполнить ИИ-анализ провалов');
    } finally {
      setAiAnalyzeLoading(false);
    }
  }

  const filteredTestsByCategory = useMemo(() => {
    if (!autoSuite) return {} as Record<string, AutomatedTestsPayload['results']>;
    const map: Record<string, AutomatedTestsPayload['results']> = {};
    for (const row of autoSuite.results) {
      if (testFilter !== 'all' && row.status !== testFilter) continue;
      if (!map[row.category]) map[row.category] = [];
      map[row.category]!.push(row);
    }
    return map;
  }, [autoSuite, testFilter]);

  const overall = monitor?.overall ?? 'healthy';
  const metrics = monitor?.metrics;
  const activeAlerts = monitor?.activeAlerts ?? [];

  const heroColors =
    overall === 'critical'
      ? 'border-red-300 bg-gradient-to-br from-red-50 via-white to-red-50/40'
      : overall === 'degraded'
        ? 'border-amber-300 bg-gradient-to-br from-amber-50 via-white to-amber-50/40'
        : 'border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-stone-50';

  const overallTitle =
    overall === 'critical'
      ? 'Обнаружена критическая проблема'
      : overall === 'degraded'
        ? 'Есть предупреждения — система работает с деградацией'
        : 'Все ключевые системы работают в норме';

  const history = metrics?.minuteHistory ?? [];
  const reqSeries = history.map((p) => p.requests);
  const err5xxSeries = history.map((p) => p.errors5xx);
  const p95Series = history.map((p) => Math.round(p.p95Ms));

  return (
    <div className="space-y-5">
      {/* ─── Hero Status Banner ─── */}
      <div className={`rounded-3xl border p-5 shadow-sm transition-colors ${heroColors}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              {overall === 'critical' ? (
                <LuShieldAlert className="h-6 w-6 text-red-600" />
              ) : overall === 'degraded' ? (
                <LuTriangleAlert className="h-6 w-6 text-amber-600" />
              ) : (
                <LuShieldCheck className="h-6 w-6 text-emerald-600" />
              )}
              <h2 className="text-lg font-extrabold tracking-tight text-stone-900">
                Центр мониторинга и диагностики
              </h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  overall === 'critical'
                    ? 'border-red-300 bg-red-100 text-red-800'
                    : overall === 'degraded'
                      ? 'border-amber-300 bg-amber-100 text-amber-800'
                      : 'border-emerald-300 bg-emerald-100 text-emerald-800'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    overall === 'critical'
                      ? 'animate-ping bg-red-600'
                      : overall === 'degraded'
                        ? 'bg-amber-500'
                        : autoRefresh
                          ? 'animate-pulse bg-emerald-500'
                          : 'bg-emerald-500'
                  }`}
                />
                {overall === 'critical' ? 'CRITICAL' : overall === 'degraded' ? 'DEGRADED' : 'HEALTHY'}
              </span>
            </div>

            <p className="text-sm font-medium text-stone-700">{overallTitle}</p>

            {metrics && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span className="inline-flex items-center gap-1">
                  <LuClock className="h-3.5 w-3.5" />
                  Uptime: <strong className="text-stone-800">{formatUptime(metrics.processUptimeSec)}</strong>
                </span>
                <span>
                  PID: <strong className="text-stone-800">{metrics.pid}</strong>
                </span>
                <span>
                  Node: <strong className="text-stone-800">{metrics.nodeVersion}</strong> ({metrics.env})
                </span>
                <span>
                  CPU ядер: <strong className="text-stone-800">{metrics.cpuCores}</strong>
                </span>
                <span>
                  Обновлено: <strong className="text-stone-800">{formatTimeShort(monitor?.generatedAt)}</strong>
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Авто (15с)
            </label>
            <button
              type="button"
              onClick={() => void handleRunMonitorNow()}
              disabled={runningNow}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-50"
            >
              <LuRefreshCw className={`h-3.5 w-3.5 ${runningNow ? 'animate-spin' : ''}`} />
              {runningNow ? 'Проверка…' : 'Проверить сейчас'}
            </button>
            <button
              type="button"
              onClick={() => void runAutoTestsOnly()}
              disabled={autoLoading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-white px-3.5 py-2 text-xs font-bold text-primary shadow-sm hover:bg-primary/5 disabled:opacity-50"
            >
              <LuFlaskConical className="h-3.5 w-3.5" />
              {autoLoading ? 'Тесты…' : 'Автотесты'}
            </button>
            <button
              type="button"
              onClick={() => void runFullAnalysis()}
              disabled={reportLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            >
              <LuPlay className="h-3.5 w-3.5" />
              {reportLoading ? 'Аудит…' : 'Полный отчёт'}
            </button>
          </div>
        </div>
      </div>

      {errorText && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <LuCircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>{errorText}</span>
        </div>
      )}

      {/* ─── Active Alerts Strip ─── */}
      {activeAlerts.length > 0 && (
        <div className="rounded-3xl border border-red-200 bg-red-50/70 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-extrabold text-red-900">
              <LuBellRing className="h-4 w-4 text-red-600" />
              Активные инциденты ({activeAlerts.length})
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('alerts')}
              className="text-xs font-semibold text-red-700 underline hover:text-red-900"
            >
              Настройки оповещений →
            </button>
          </div>
          <div className="space-y-2.5">
            {activeAlerts.map((alert) => (
              <div
                key={alert.key}
                className="flex flex-col gap-2.5 rounded-2xl border border-red-200/80 bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                        alert.severity === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {alert.severity === 'critical' ? 'Критично' : 'Внимание'}
                    </span>
                    {alert.status === 'acknowledged' && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                        Принят {alert.acknowledgedBy ? `(${alert.acknowledgedBy})` : ''}
                      </span>
                    )}
                    <span className="text-sm font-bold text-stone-900">{alert.title}</span>
                    <span className="text-[11px] text-stone-400">×{alert.occurrences}</span>
                  </div>
                  <p className="text-xs text-stone-600">{alert.message}</p>
                  <p className="text-[11px] text-stone-400">
                    Впервые: {formatDateTimeRu(alert.firstSeenAt)} · Последний раз:{' '}
                    {formatDateTimeRu(alert.lastSeenAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {alert.status !== 'acknowledged' && (
                    <button
                      type="button"
                      disabled={alertActionKey === alert.key}
                      onClick={() => void handleAckAlert(alert.key)}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      Принять
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={alertActionKey === alert.key}
                    onClick={() => void handleResolveAlert(alert.key)}
                    className="rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    Закрыть
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sub-navigation Tabs ─── */}
      <div className="flex flex-wrap gap-2 rounded-2xl border border-stone-200/80 bg-stone-100/70 p-1.5">
        {(
          [
            { id: 'live', label: 'Живой мониторинг', icon: LuActivity },
            { id: 'subsystems', label: 'Подсистемы и Cron', icon: LuLayers },
            { id: 'tests', label: 'Автотесты и аудит', icon: LuFlaskConical },
            {
              id: 'alerts',
              label: `Алерты и оповещения${activeAlerts.length ? ` (${activeAlerts.length})` : ''}`,
              icon: LuBell,
            },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                active
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-stone-600 hover:bg-white/60 hover:text-stone-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: LIVE MONITORING                                               */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'live' && (
        <div className="space-y-5">
          {monitorLoading && !monitor ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              Загружаем живую телеметрию сервера…
            </div>
          ) : (
            metrics &&
            monitor && (
              <>
                {/* KPI Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>HTTP трафик</span>
                      <LuActivity className="h-4 w-4 text-primary" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {metrics.requests.perMinute} <span className="text-xs font-medium text-stone-400">/мин</span>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      Всего {metrics.requests.total} · 4xx: {metrics.requests.errors4xx} ·{' '}
                      <span className={metrics.requests.errors5xx > 0 ? 'font-bold text-red-600' : ''}>
                        5xx: {metrics.requests.errors5xx}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>Латентность p95</span>
                      <LuClock className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {Math.round(metrics.requests.latency.p95Ms)}{' '}
                      <span className="text-xs font-medium text-stone-400">мс</span>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      p50: {Math.round(metrics.requests.latency.p50Ms)} · p99:{' '}
                      {Math.round(metrics.requests.latency.p99Ms)} мс
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>Event Loop Lag</span>
                      <LuCpu className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {metrics.eventLoop.lagMs.toFixed(1)}{' '}
                      <span className="text-xs font-medium text-stone-400">мс</span>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      p95: {metrics.eventLoop.p95LagMs.toFixed(1)} · max: {metrics.eventLoop.maxLagMs.toFixed(1)} мс
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>V8 Heap / RSS</span>
                      <LuServer className="h-4 w-4 text-violet-600" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {metrics.memory.usagePercent.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      Heap {formatBytes(metrics.memory.heapUsedBytes)} / {formatBytes(metrics.memory.heapLimitBytes)} ·
                      RSS {formatBytes(metrics.memory.rssBytes)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>RAM сервера</span>
                      <LuHardDrive className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {metrics.systemMemory.usagePercent.toFixed(1)}%
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      Своб. {formatBytes(metrics.systemMemory.availableBytes)} из{' '}
                      {formatBytes(metrics.systemMemory.totalBytes)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between text-xs text-stone-500">
                      <span>Вотчдог / Сбои</span>
                      <LuShieldCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="mt-1.5 text-xl font-extrabold text-stone-900">
                      {monitor.watchdog.enabled ? `${monitor.watchdog.intervalSec}с` : 'Выкл'}
                    </div>
                    <div className="mt-1 text-[11px] text-stone-500">
                      Rej: {metrics.unhandledRejections} · Exc: {metrics.uncaughtExceptions}
                    </div>
                  </div>
                </div>

                {/* Sparklines (60 min) */}
                <div className="grid gap-3 md:grid-cols-3">
                  <MiniSparkline
                    label="Трафик за последний час (запросов/мин)"
                    values={reqSeries}
                    color="#7d3640"
                    fillColor="rgba(125, 54, 64, 0.12)"
                    unit=""
                  />
                  <MiniSparkline
                    label="Ошибки HTTP 5xx (за последний час)"
                    values={err5xxSeries}
                    color="#dc2626"
                    fillColor="rgba(220, 38, 38, 0.12)"
                    unit=""
                  />
                  <MiniSparkline
                    label="Латентность p95 по минутам (мс)"
                    values={p95Series}
                    color="#2563eb"
                    fillColor="rgba(37, 99, 235, 0.12)"
                    unit=" мс"
                  />
                </div>

                {/* Watchdog Checks Grid */}
                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-stone-900">
                        Пробы здоровья вотчдога ({monitor.checks.length})
                      </h3>
                      <p className="text-xs text-stone-500">
                        Последний цикл: {formatDateTimeRu(monitor.watchdog.lastRunAt)} · авто-алерты срабатывают при
                        превышении порогов
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {monitor.checks.map((chk) => {
                      const isMuted = monitor.settings.mutedChecks.includes(chk.id);
                      return (
                        <div
                          key={chk.id}
                          className={`rounded-2xl border p-3.5 transition-colors ${
                            chk.status === 'fail'
                              ? 'border-red-200 bg-red-50/40'
                              : chk.status === 'warn'
                                ? 'border-amber-200 bg-amber-50/40'
                                : 'border-stone-200/80 bg-stone-50/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-stone-900">{chk.label}</span>
                                {isMuted && (
                                  <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                                    без звука
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-[11px] leading-snug text-stone-600">{chk.details}</p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusPillClasses(chk.status)}`}
                            >
                              {statusLabelRu(chk.status)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[10px] text-stone-400">
                            <span>
                              {chk.threshold
                                ? `Порог: warn ≥ ${chk.threshold.warn}${chk.threshold.unit}, fail ≥ ${chk.threshold.fail}${chk.threshold.unit}`
                                : chk.optional
                                  ? 'Опциональный узел'
                                  : 'Обязательный узел'}
                            </span>
                            <span>{chk.durationMs} мс</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Problematic & Slow Endpoints + Live 5xx Feed */}
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                    <h3 className="mb-3 text-sm font-extrabold text-stone-900">
                      Проблемные маршруты (5xx / 4xx)
                    </h3>
                    {metrics.topErrorEndpoints.length === 0 ? (
                      <p className="text-xs text-stone-500">Ошибок по API-маршрутам с момента старта не зафиксировано.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-stone-200 text-[11px] text-stone-500">
                            <tr>
                              <th className="py-1.5 pr-2">Маршрут</th>
                              <th className="py-1.5 px-2 text-right">5xx</th>
                              <th className="py-1.5 px-2 text-right">4xx</th>
                              <th className="py-1.5 pl-2 text-right">Всего</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {metrics.topErrorEndpoints.map((ep) => (
                              <tr key={ep.route}>
                                <td className="py-2 pr-2 font-mono text-[11px] text-stone-800">{ep.route}</td>
                                <td className="py-2 px-2 text-right font-bold text-red-600">{ep.errors5xx}</td>
                                <td className="py-2 px-2 text-right text-amber-700">{ep.errors4xx}</td>
                                <td className="py-2 pl-2 text-right text-stone-500">{ep.requests}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                    <h3 className="mb-3 text-sm font-extrabold text-stone-900">
                      Самые медленные маршруты (p95)
                    </h3>
                    {metrics.slowestEndpoints.length === 0 ? (
                      <p className="text-xs text-stone-500">Пока недостаточно запросов для расчёта p95.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b border-stone-200 text-[11px] text-stone-500">
                            <tr>
                              <th className="py-1.5 pr-2">Маршрут</th>
                              <th className="py-1.5 px-2 text-right">p95</th>
                              <th className="py-1.5 px-2 text-right">max</th>
                              <th className="py-1.5 pl-2 text-right">Запр.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {metrics.slowestEndpoints.map((ep) => (
                              <tr key={ep.route}>
                                <td className="py-2 pr-2 font-mono text-[11px] text-stone-800">{ep.route}</td>
                                <td
                                  className={`py-2 px-2 text-right font-bold ${
                                    ep.p95Ms >= 1500
                                      ? 'text-red-600'
                                      : ep.p95Ms >= 600
                                        ? 'text-amber-700'
                                        : 'text-stone-800'
                                  }`}
                                >
                                  {Math.round(ep.p95Ms)} мс
                                </td>
                                <td className="py-2 px-2 text-right text-stone-500">{Math.round(ep.maxMs)} мс</td>
                                <td className="py-2 pl-2 text-right text-stone-500">{ep.requests}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* Live Recent 5xx */}
                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-extrabold text-stone-900">
                    Последние серверные ошибки HTTP 5xx ({metrics.recentErrors5xx.length})
                  </h3>
                  {metrics.recentErrors5xx.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-700">
                      <LuCircleCheck className="h-4 w-4" />
                      Ошибок HTTP 5xx с момента запуска сервера не было.
                    </div>
                  ) : (
                    <div className="max-h-64 space-y-1.5 overflow-y-auto">
                      {metrics.recentErrors5xx.map((err, idx) => (
                        <div
                          key={`${err.at}-${idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-red-800">
                              {err.status}
                            </span>
                            <span className="font-mono font-semibold text-stone-900">
                              {err.method} {err.path}
                            </span>
                            {err.message && <span className="text-red-700">— {err.message}</span>}
                          </div>
                          <span className="text-[11px] text-stone-500">
                            {formatDateTimeRu(err.at)} · {err.durationMs} мс
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SUBSYSTEMS & CRON                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'subsystems' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
            <div>
              <h3 className="text-sm font-extrabold text-stone-900">
                Глубокая инспекция подсистем ({subsystems?.items.length ?? 0})
              </h3>
              <p className="text-xs text-stone-500">
                PostgreSQL (пул, блокировки, размер), WebSocket, Redis, Supabase, LiveKit, Telegram, Push, AI/LLM,
                SMS.ru, Бекапы, Безопасность, Диск.
                {subsystems && ` Собрано за ${subsystems.durationMs} мс (${formatTimeShort(subsystems.collectedAt)}).`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchSubsystems()}
              disabled={subsystemsLoading}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
            >
              <LuRefreshCw className={`h-3.5 w-3.5 ${subsystemsLoading ? 'animate-spin' : ''}`} />
              {subsystemsLoading ? 'Сканируем…' : 'Пересканировать подсистемы'}
            </button>
          </div>

          {subsystemsLoading && !subsystems ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
              Проверяем все 12 подсистем…
            </div>
          ) : (
            subsystems && (
              <>
                <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                  {subsystems.items.map((sub) => (
                    <div
                      key={sub.id}
                      className={`rounded-3xl border bg-white p-4 shadow-sm ${
                        sub.status === 'fail'
                          ? 'border-red-300'
                          : sub.status === 'warn'
                            ? 'border-amber-300'
                            : 'border-stone-200/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <LuDatabase className="h-4 w-4 text-primary" />
                          <h4 className="text-sm font-extrabold text-stone-900">{sub.name}</h4>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusPillClasses(sub.status)}`}
                        >
                          {statusLabelRu(sub.status)}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs text-stone-600">{sub.summary}</p>

                      {Object.keys(sub.metrics).length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-1.5">
                          {Object.entries(sub.metrics).map(([k, v]) => (
                            <div
                              key={k}
                              className="rounded-xl bg-stone-50 px-2.5 py-1.5 text-[11px]"
                            >
                              <div className="truncate text-[10px] text-stone-400">{metricLabelRu(k)}</div>
                              <div className="truncate font-semibold text-stone-800">
                                {formatMetricValue(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {sub.warnings && sub.warnings.length > 0 && (
                        <div className="mt-2.5 space-y-1">
                          {sub.warnings.map((w, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900"
                            >
                              {w}
                            </div>
                          ))}
                        </div>
                      )}

                      {typeof sub.latencyMs === 'number' && (
                        <div className="mt-2 text-right text-[10px] text-stone-400">
                          Проверка: {sub.latencyMs} мс
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Cron Jobs Heartbeats */}
                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-extrabold text-stone-900">
                    Фоновые задачи (Cron / Воркеры)
                  </h3>
                  {subsystems.cronJobs.length === 0 ? (
                    <p className="text-xs text-stone-500">
                      Фоновые задачи ещё не совершили первый тик после запуска сервера (обычно появляются в течение 15–60 секунд).
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-stone-200 text-[11px] text-stone-500">
                          <tr>
                            <th className="py-2 pr-3">Задача</th>
                            <th className="py-2 px-2">Статус</th>
                            <th className="py-2 px-2 text-right">Запусков</th>
                            <th className="py-2 px-2 text-right">Ошибок</th>
                            <th className="py-2 px-2 text-right">Длительность</th>
                            <th className="py-2 pl-2 text-right">Последний запуск</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {subsystems.cronJobs.map((job) => (
                            <tr key={job.name}>
                              <td className="py-2 pr-3 font-semibold text-stone-800">
                                {job.name}
                                {job.lastError && (
                                  <div className="text-[11px] font-normal text-red-600">{job.lastError}</div>
                                )}
                              </td>
                              <td className="py-2 px-2">
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    job.ok
                                      ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                                      : 'border-red-200 bg-red-100 text-red-800'
                                  }`}
                                >
                                  {job.ok ? 'OK' : 'Ошибка'}
                                </span>
                              </td>
                              <td className="py-2 px-2 text-right text-stone-600">{job.runs}</td>
                              <td
                                className={`py-2 px-2 text-right font-semibold ${
                                  job.failures > 0 ? 'text-red-600' : 'text-stone-400'
                                }`}
                              >
                                {job.failures}
                              </td>
                              <td className="py-2 px-2 text-right text-stone-600">{job.durationMs} мс</td>
                              <td className="py-2 pl-2 text-right text-stone-500">
                                {formatDateTimeRu(job.lastRunAt)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: AUTOMATED TESTS & FULL AUDIT REPORT                           */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tests' && (
        <div className="space-y-5">
          {/* Controls */}
          <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Фокус аудита (например: проверка перед релизом)"
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void runAutoTestsOnly()}
                disabled={autoLoading}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-white px-4 py-2 text-xs font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
              >
                <LuFlaskConical className="h-4 w-4" />
                {autoLoading ? 'Выполняем тесты…' : 'Запустить 20+ автотестов'}
              </button>
              <button
                type="button"
                onClick={() => void runFullAnalysis()}
                disabled={reportLoading}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:opacity-95 disabled:opacity-50"
              >
                <LuPlay className="h-4 w-4" />
                {reportLoading ? 'Формируем отчёт…' : 'Полный отчёт + Аудит'}
              </button>
            </div>
          </div>

          {/* Full Audit & Release Gate */}
          {report && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500">Индекс здоровья</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span
                      className={`text-3xl font-black ${
                        report.audit.overallScore >= 85
                          ? 'text-emerald-600'
                          : report.audit.overallScore >= 65
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {report.audit.overallScore}
                    </span>
                    <span className="text-sm text-stone-400">/ 100</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-xs text-stone-600">{report.audit.summary}</p>
                </div>

                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500">Release Gate</div>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold ${
                        report.releaseValidation.pass
                          ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                          : 'border-red-200 bg-red-100 text-red-800'
                      }`}
                    >
                      {report.releaseValidation.pass ? 'Готово к работе' : 'Есть блокеры'}
                    </span>
                  </div>
                  {report.releaseValidation.blockers.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-red-700">
                      {report.releaseValidation.blockers.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-stone-500">Все обязательные проверки и critical env пройдены.</p>
                  )}
                </div>

                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500">Кодовая база и журнал</div>
                  <div className="mt-2 space-y-1 text-xs text-stone-700">
                    <div>
                      Файлов кода: <strong>{report.project.filesScanned}</strong> · LOC:{' '}
                      <strong>{report.project.linesOfCode.toLocaleString('ru-RU')}</strong>
                    </div>
                    <div>
                      Юнит-тесты в репо: <strong>{report.project.hasTests ? 'Да' : 'Нет'}</strong>
                    </div>
                    <div>
                      Журнал (последние 200): info {report.journal.byLevel.info} / warn {report.journal.byLevel.warn} /{' '}
                      <strong className={report.journal.byLevel.error > 0 ? 'text-red-600' : ''}>
                        err {report.journal.byLevel.error}
                      </strong>
                    </div>
                    <div>
                      Event loop: <strong>{report.performance.eventLoopLagMs} мс</strong> · p95:{' '}
                      <strong>{report.performance.httpDurationP95Ms} мс</strong>
                    </div>
                  </div>
                </div>
              </div>

              {report.regression.hasRegression && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                  <div className="font-bold">Обнаружена регрессия относительно прошлого отчёта:</div>
                  <ul className="mt-1 list-disc pl-4">
                    {report.regression.items.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Issues & Recommendations */}
              {report.audit.issues.length > 0 && (
                <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-extrabold text-stone-900">
                    Выявленные замечания аудита ({report.audit.issues.length})
                  </h3>
                  <div className="space-y-2">
                    {report.audit.issues.map((issue) => (
                      <div key={issue.id} className="rounded-2xl border border-stone-200/80 p-3 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              issue.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800'
                                : issue.severity === 'HIGH'
                                  ? 'bg-orange-100 text-orange-800'
                                  : issue.severity === 'MEDIUM'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {issue.severity}
                          </span>
                          <span className="font-bold text-stone-900">{issue.title}</span>
                        </div>
                        <p className="mt-1 text-stone-600">{issue.description}</p>
                        {issue.suggestion && (
                          <p className="mt-1 font-medium text-primary">Рекомендация: {issue.suggestion}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Automated Tests Results */}
          {autoSuite && (
            <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-stone-900">
                    Интеграционные автотесты: {autoSuite.summary.passed}/{autoSuite.summary.total} пройдено
                  </h3>
                  <p className="text-xs text-stone-500">
                    База: <span className="font-mono">{autoSuite.baseUrl}</span> · время: {autoSuite.durationMs} мс ·
                    провалов: <strong className="text-red-600">{autoSuite.summary.failed}</strong> · пропущено:{' '}
                    {autoSuite.summary.skipped}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'failed', 'passed', 'skipped'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setTestFilter(f)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                        testFilter === f
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {f === 'all'
                        ? 'Все'
                        : f === 'failed'
                          ? `Провалы (${autoSuite.summary.failed})`
                          : f === 'passed'
                            ? `Ок (${autoSuite.summary.passed})`
                            : `Пропуск (${autoSuite.summary.skipped})`}
                    </button>
                  ))}
                  {autoSuite.summary.failed > 0 && (
                    <button
                      type="button"
                      onClick={() => void runAiFailureAnalysis()}
                      disabled={aiAnalyzeLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      <LuSparkles className="h-3.5 w-3.5" />
                      {aiAnalyzeLoading ? 'ИИ анализирует…' : 'ИИ-разбор провалов'}
                    </button>
                  )}
                </div>
              </div>

              {failureAnalysis && (
                <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-xs">
                  <div className="font-extrabold text-violet-950">ИИ-разбор проваленных тестов</div>
                  <p className="mt-1 text-violet-900">{failureAnalysis.executiveSummary}</p>
                  {failureAnalysis.items.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {failureAnalysis.items.map((item) => (
                        <div key={item.testId} className="rounded-xl bg-white p-3 shadow-sm">
                          <div className="font-bold text-stone-900">
                            {item.testId} · <span className="uppercase text-violet-700">{item.severity}</span>
                          </div>
                          <p className="mt-1 text-stone-700">{item.likelyRootCause}</p>
                          <ul className="mt-1 list-disc pl-4 text-stone-600">
                            {item.recommendedSteps.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {Object.entries(filteredTestsByCategory).map(([category, rows]) => (
                  <div key={category}>
                    <div className="mb-2 text-xs font-extrabold uppercase tracking-wide text-stone-500">
                      {category}
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          className={`rounded-xl border px-3 py-2 text-xs ${
                            row.status === 'failed'
                              ? 'border-red-200 bg-red-50/40'
                              : 'border-stone-200/70 bg-stone-50/30'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusPillClasses(row.status)}`}
                              >
                                {row.status === 'passed'
                                  ? 'OK'
                                  : row.status === 'failed'
                                    ? 'FAIL'
                                    : 'SKIP'}
                              </span>
                              <span className="font-semibold text-stone-900">{row.name}</span>
                              {row.tier === 'critical' && (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
                                  critical
                                </span>
                              )}
                              {row.httpStatus && (
                                <span className="font-mono text-[11px] text-stone-500">HTTP {row.httpStatus}</span>
                              )}
                            </div>
                            <span className="text-[11px] text-stone-400">{row.durationMs} мс</span>
                          </div>
                          <p className="mt-1 text-stone-600">{row.message}</p>
                          {row.responsePreview && row.status === 'failed' && (
                            <pre className="mt-1.5 max-h-28 overflow-auto rounded-lg bg-stone-900 p-2 font-mono text-[10px] text-stone-100">
                              {row.responsePreview}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!autoSuite && !report && !autoLoading && !reportLoading && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 p-8 text-center text-sm text-stone-500">
              Нажмите «Запустить 20+ автотестов» для быстрой проверки API и БД или «Полный отчёт + Аудит» для
              комплексной оценки с индексом здоровья.
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB 4: ALERTS, CHANNELS & SETTINGS                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && monitor && settingsDraft && (
        <div className="space-y-5">
          {/* Channels Readiness + Test Button */}
          <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-stone-900">
                  Каналы оповещения администраторов
                </h3>
                <p className="text-xs text-stone-500">
                  Получатели: активных админов <strong>{monitor.channels.adminTargets}</strong> · с Telegram:{' '}
                  <strong>{monitor.channels.adminsWithTelegram}</strong> · с Push-подпиской:{' '}
                  <strong>{monitor.channels.adminsWithPush}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSendTestAlert()}
                disabled={testAlertLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                <LuSend className="h-3.5 w-3.5" />
                {testAlertLoading ? 'Отправляем…' : 'Отправить тестовый алерт'}
              </button>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3 text-xs">
                <div className="font-bold text-stone-900">Push (Web / Native)</div>
                <div className="mt-1 text-stone-600">
                  VAPID: {monitor.channels.vapidReady ? 'готов' : 'нет'} · FCM:{' '}
                  {monitor.channels.fcmReady ? 'готов' : 'нет'}
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3 text-xs">
                <div className="font-bold text-stone-900">Telegram Bot</div>
                <div className="mt-1 text-stone-600">
                  {monitor.channels.telegramConfigured ? 'Бот активен' : 'Не настроен / выключен'}
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3 text-xs">
                <div className="font-bold text-stone-900">Telegram Ops-чат</div>
                <div className="mt-1 text-stone-600">
                  {monitor.channels.telegramOpsChatConfigured ? 'Указан' : 'Не задан (опционально)'}
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-stone-50/50 p-3 text-xs">
                <div className="font-bold text-stone-900">Webhook (Slack/Discord)</div>
                <div className="mt-1 text-stone-600">
                  {monitor.channels.webhookConfigured ? 'Настроен' : 'Не задан (опционально)'}
                </div>
              </div>
            </div>

            {testAlertResult && (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                <div className="font-bold">Результат тестовой отправки:</div>
                <div className="mt-1">
                  Push: отправлено {testAlertResult.pushSent} (ошибок {testAlertResult.pushFailed}) · Telegram:
                  отправлено {testAlertResult.telegramSent} (ошибок {testAlertResult.telegramFailed}) · Webhook:{' '}
                  {testAlertResult.webhookSent ? 'доставлен' : testAlertResult.webhookError ?? 'не настроен'}
                </div>
                {testAlertResult.errors.length > 0 && (
                  <div className="mt-1 text-red-700">Ошибки: {testAlertResult.errors.join('; ')}</div>
                )}
              </div>
            )}
          </div>

          {/* Settings Form */}
          <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-stone-900">
                  Настройки умного мониторинга и порогов срабатывания
                </h3>
                <p className="text-xs text-stone-500">
                  Сохраняются в базе данных и применяются немедленно без перезапуска сервера.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
              >
                <LuSave className="h-3.5 w-3.5" />
                {savingSettings ? 'Сохранение…' : 'Сохранить настройки'}
              </button>
            </div>

            {settingsSavedMsg && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                {settingsSavedMsg}
              </div>
            )}

            {/* Main switches */}
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-2.5 rounded-2xl border border-stone-200 p-3 text-xs font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={settingsDraft.enabled}
                  onChange={(e) => setSettingsDraft({ ...settingsDraft, enabled: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Фоновый мониторинг (вотчдог) включён
              </label>

              <label className="flex flex-col gap-1 rounded-2xl border border-stone-200 p-3 text-xs">
                <span className="font-semibold text-stone-700">Интервал проверки (сек, 10–600)</span>
                <input
                  type="number"
                  min={10}
                  max={600}
                  value={settingsDraft.intervalSec}
                  onChange={(e) =>
                    setSettingsDraft({ ...settingsDraft, intervalSec: Number(e.target.value) || 60 })
                  }
                  className="rounded-lg border border-stone-300 px-2.5 py-1 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-stone-200 p-3 text-xs">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-stone-700">Пауза Crit (мин)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={settingsDraft.cooldownCriticalMin}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        cooldownCriticalMin: Number(e.target.value) || 15,
                      })
                    }
                    className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-stone-700">Пауза Warn (мин)</span>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={settingsDraft.cooldownWarningMin}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        cooldownWarningMin: Number(e.target.value) || 60,
                      })
                    }
                    className="rounded-lg border border-stone-300 px-2 py-1 text-sm"
                  />
                </label>
              </div>
            </div>

            {/* Delivery Channels */}
            <div className="space-y-3 border-t border-stone-100 pt-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                Куда отправлять оповещения
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2.5 rounded-xl border border-stone-200 p-3 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={settingsDraft.notifyChannels.push}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        notifyChannels: { ...settingsDraft.notifyChannels, push: e.target.checked },
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Push-уведомления всем администраторам (Web + Android/iOS)
                </label>
                <label className="flex items-center gap-2.5 rounded-xl border border-stone-200 p-3 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={settingsDraft.notifyChannels.telegram}
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        notifyChannels: { ...settingsDraft.notifyChannels, telegram: e.target.checked },
                      })
                    }
                    className="h-4 w-4 accent-primary"
                  />
                  Telegram-сообщения администраторам и в Ops-чат
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-stone-700">
                    Telegram Ops Chat ID (группа/канал техподдержки, опционально)
                  </span>
                  <input
                    type="text"
                    value={settingsDraft.telegramOpsChatId ?? ''}
                    placeholder="-1001234567890"
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        telegramOpsChatId: e.target.value.trim() || null,
                      })
                    }
                    className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-semibold text-stone-700">
                    Webhook URL (Slack / Discord / n8n / свой endpoint, опционально)
                  </span>
                  <input
                    type="url"
                    value={settingsDraft.notifyChannels.webhookUrl ?? ''}
                    placeholder="https://hooks.slack.com/services/..."
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        notifyChannels: {
                          ...settingsDraft.notifyChannels,
                          webhookUrl: e.target.value.trim() || null,
                        },
                      })
                    }
                    className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            {/* Event triggers */}
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                При каких событиях оповещать
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    ['critical', 'Критические сбои (БД, диск, память)'],
                    ['warning', 'Предупреждения (деградация, тормоза)'],
                    ['recovery', 'Восстановление после сбоя'],
                    ['crash', 'Падение процесса (uncaughtException / boot)'],
                    ['http5xxBurst', 'Всплеск ошибок HTTP 5xx'],
                    ['restart', 'Аварийный перезапуск контейнера (OOM / kill)'],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-xs font-medium text-stone-800"
                  >
                    <input
                      type="checkbox"
                      checked={settingsDraft.notifyOn[key]}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          notifyOn: { ...settingsDraft.notifyOn, [key]: e.target.checked },
                        })
                      }
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Thresholds */}
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <div className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                Пороги срабатывания (Warn / Critical)
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ['diskWarnPercent', 'Диск warn (%)'],
                    ['diskFailPercent', 'Диск crit (%)'],
                    ['systemMemWarnPercent', 'RAM сервера warn (%)'],
                    ['systemMemFailPercent', 'RAM сервера crit (%)'],
                    ['heapWarnPercent', 'V8 Heap warn (%)'],
                    ['heapFailPercent', 'V8 Heap crit (%)'],
                    ['eventLoopWarnMs', 'Event Loop warn (мс)'],
                    ['eventLoopFailMs', 'Event Loop crit (мс)'],
                    ['latencyP95WarnMs', 'HTTP p95 warn (мс)'],
                    ['latencyP95FailMs', 'HTTP p95 crit (мс)'],
                    ['errorRateWarnPercent', 'Доля 5xx warn (%)'],
                    ['errorRateFailPercent', 'Доля 5xx crit (%)'],
                    ['http5xxBurstCount', 'Всплеск 5xx (шт)'],
                    ['http5xxBurstWindowSec', 'Окно всплеска 5xx (сек)'],
                    ['dbLatencyWarnMs', 'БД ping warn (мс)'],
                    ['errorRateWindowMin', 'Окно error rate (мин)'],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex flex-col gap-1 text-xs">
                    <span className="text-stone-600">{label}</span>
                    <input
                      type="number"
                      value={settingsDraft.thresholds[field]}
                      onChange={(e) =>
                        setSettingsDraft({
                          ...settingsDraft,
                          thresholds: {
                            ...settingsDraft.thresholds,
                            [field]: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Muted checks */}
            {monitor.checks.length > 0 && (
              <div className="space-y-2 border-t border-stone-100 pt-4">
                <div className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                  Заглушить уведомления для отдельных проверок
                </div>
                <div className="flex flex-wrap gap-2">
                  {monitor.checks.map((chk) => {
                    const muted = settingsDraft.mutedChecks.includes(chk.id);
                    return (
                      <button
                        key={chk.id}
                        type="button"
                        onClick={() => {
                          const next = muted
                            ? settingsDraft.mutedChecks.filter((id) => id !== chk.id)
                            : [...settingsDraft.mutedChecks, chk.id];
                          setSettingsDraft({ ...settingsDraft, mutedChecks: next });
                        }}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                          muted
                            ? 'border-stone-400 bg-stone-800 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {muted && <LuBellOff className="h-3 w-3" />}
                        {chk.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Alert History Table */}
          <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-extrabold text-stone-900">
              История инцидентов ({monitor.alertHistory.length})
            </h3>
            {monitor.alertHistory.length === 0 ? (
              <p className="text-xs text-stone-500">Инцидентов пока не зафиксировано.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-stone-200 text-[11px] text-stone-500">
                    <tr>
                      <th className="py-2 pr-2">Уровень</th>
                      <th className="py-2 px-2">Событие</th>
                      <th className="py-2 px-2">Статус</th>
                      <th className="py-2 px-2 text-right">Повторов</th>
                      <th className="py-2 px-2">Начало</th>
                      <th className="py-2 pl-2">Завершение / Обновлено</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {monitor.alertHistory.map((item) => (
                      <tr key={`${item.key}-${item.firstSeenAt}`}>
                        <td className="py-2 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.severity === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.severity === 'critical' ? 'CRIT' : 'WARN'}
                          </span>
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-semibold text-stone-900">{item.title}</div>
                          <div className="max-w-md truncate text-[11px] text-stone-500">{item.message}</div>
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.status === 'resolved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'acknowledged'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {item.status === 'resolved'
                              ? 'Решён'
                              : item.status === 'acknowledged'
                                ? 'Принят'
                                : 'Активен'}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-stone-600">{item.occurrences}</td>
                        <td className="py-2 px-2 text-stone-500">{formatDateTimeRu(item.firstSeenAt)}</td>
                        <td className="py-2 pl-2 text-stone-500">
                          {formatDateTimeRu(item.resolvedAt ?? item.lastSeenAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
