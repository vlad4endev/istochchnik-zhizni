export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface DiagnosticIssue {
  id: string;
  severity: SeverityLevel;
  title: string;
  description: string;
  suggestion: string;
  category?: string;
}

export interface CodeAnalysisResult {
  mode: string;
  language: string;
  summary: string;
  score: number;
  issues: DiagnosticIssue[];
  recommendations: string[];
  rawModelResponse?: string;
  fallback?: boolean;
}

export interface CpuMetrics {
  usagePercent: number;
  sampledOverMs: number;
}

export interface MemoryMetrics {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface DiskMetrics {
  filesystem: string;
  totalKb: number;
  usedKb: number;
  availableKb: number;
  usagePercent: number;
  mountPoint: string;
}

export interface RuntimeMetrics {
  pid: number;
  nodeVersion: string;
  platform: string;
  env: string;
  processUptimeSec: number;
  systemUptimeSec: number;
  loadAverage: number[];
}

export interface ServerDiagnosticResult {
  timestamp: string;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics | null;
  runtime: RuntimeMetrics;
  recommendations: string[];
  fallback?: boolean;
}

export interface LargestFileInfo {
  path: string;
  sizeBytes: number;
  lines: number;
}

export interface ProjectScanResult {
  timestamp: string;
  rootDir: string;
  scannedDir: string;
  filesScanned: number;
  directoriesScanned: number;
  linesOfCode: number;
  byExtension: Record<string, number>;
  hasTests: boolean;
  hasDocker: boolean;
  hasGitignore: boolean;
  hasEnvExample: boolean;
  packageDependenciesCount: number;
  packageDevDependenciesCount: number;
  topLargestFiles: LargestFileInfo[];
}

export interface ProjectAuditResult {
  timestamp: string;
  description: string;
  overallScore: number;
  summary: string;
  issues: DiagnosticIssue[];
  recommendations: string[];
  scanSnapshot?: ProjectScanResult;
  serverSnapshot?: ServerDiagnosticResult;
  fallback?: boolean;
}

export type DiagnosticCheckStatus = 'passed' | 'warning' | 'failed';

export interface DiagnosticCheck {
  name: string;
  status: DiagnosticCheckStatus;
  details: string;
  durationMs: number;
}

export interface JournalAnalysisResult {
  total: number;
  byLevel: {
    info: number;
    warn: number;
    error: number;
  };
  topEvents: Array<{ event: string; count: number }>;
  recentErrors: Array<{ message: string; created_at: string; scope: string }>;
}

export type AutomatedTestTier = 'critical' | 'standard' | 'optional';

export interface AutomatedTestResult {
  id: string;
  name: string;
  category: string;
  tier: AutomatedTestTier;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  message: string;
  detail?: string;
  /** Код ответа HTTP, если проверка делала запрос. */
  httpStatus?: number;
  /** Фрагмент тела ответа сервера (ошибки API, HTML и т.д.), для диагностики. */
  responsePreview?: string;
}

/** Ответ ИИ по проваленным автотестам. */
export interface AutoTestFailureAnalysisItem {
  testId: string;
  likelyRootCause: string;
  evidence: string;
  recommendedSteps: string[];
  severity: 'blocking' | 'high' | 'medium' | 'low';
}

export interface AutoTestFailureAnalysisReport {
  generatedAt: string;
  executiveSummary: string;
  items: AutoTestFailureAnalysisItem[];
  fallback?: boolean;
  errorHint?: string;
}

export interface AutomatedTestsReport {
  generatedAt: string;
  baseUrl: string;
  durationMs: number;
  summary: { passed: number; failed: number; skipped: number; total: number };
  overall: 'passed' | 'degraded' | 'failed';
  authenticatedContext: boolean;
  results: AutomatedTestResult[];
  smokeEndpoints: Array<{ path: string; ok: boolean; status: number; durationMs: number; note?: string }>;
}

export interface FullDiagnosticsReport {
  generatedAt: string;
  readiness: {
    overall: 'healthy' | 'degraded' | 'critical';
    checks: DiagnosticCheck[];
  };
  environment: {
    criticalEnv: Array<{ key: string; present: boolean }>;
    missingCritical: string[];
  };
  /** Полный отчёт интеграционных автотестов (HTTP, БД, безопасность, сессия). */
  automatedTests: AutomatedTestsReport;
  smoke: {
    baseUrl: string;
    endpoints: Array<{ path: string; ok: boolean; status: number; durationMs: number; note?: string }>;
  };
  integrations: {
    redis: { configured: boolean; reachable: boolean; details: string };
    supabase: { configured: boolean; reachable: boolean; details: string };
  };
  server: ServerDiagnosticResult;
  project: ProjectScanResult;
  performance: {
    eventLoopLagMs: number;
    healthCheckMs: number;
    serverCheckMs: number;
    scanCheckMs: number;
    httpDurationP95Ms: number;
  };
  journal: JournalAnalysisResult;
  audit: ProjectAuditResult;
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
}

// ─── Система мониторинга в реальном времени ────────────────────────────────

export type MonitorCheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
export type AlertSeverity = 'critical' | 'warning';
export type MonitorCheckCategory = 'core' | 'resources' | 'traffic' | 'integrations' | 'security';

/** Результат одной проверки здоровья, выполняемой вотчдогом или полным отчётом. */
export interface MonitorCheckResult {
  id: string;
  label: string;
  category?: MonitorCheckCategory;
  status: MonitorCheckStatus;
  /** Насколько серьёзна проваленная проверка: critical роняет общий статус, warning — деградирует. */
  severity: AlertSeverity;
  /** Опциональные интеграции (Redis, Supabase, LiveKit) не считаются поломкой, если не настроены. */
  optional: boolean;
  details: string;
  value?: number;
  durationMs: number;
  threshold?: { warn: number; fail: number; unit: string };
}

export interface EndpointMetricSummary {
  route: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
  lastSeenAt: string;
}

export interface RecentError5xxSample {
  at: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  message?: string;
}

export interface CronJobHeartbeat {
  name: string;
  lastRunAt: string;
  ok: boolean;
  durationMs: number;
  runs: number;
  failures: number;
  lastError?: string;
}

/** Живая метрика процесса: счётчики запросов, латентность, event loop, память, эндпоинты. */
export interface MonitorMetricsSnapshot {
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
    /** Использование относительно реального лимита V8 heap_size_limit (без ложных тревог). */
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
  /** Поминутная история за последний час (для спарклайнов в админке). */
  minuteHistory: MonitorMinutePoint[];
  /** Самые проблемные маршруты по 5xx/4xx. */
  topErrorEndpoints: EndpointMetricSummary[];
  /** Самые медленные маршруты по p95. */
  slowestEndpoints: EndpointMetricSummary[];
  /** Последние ошибки 5xx в реальном времени. */
  recentErrors5xx: RecentError5xxSample[];
}

export interface MonitorMinutePoint {
  minuteStart: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  errorRatePercent: number;
  p95Ms: number;
}

export type MonitorAlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface MonitorAlert {
  key: string;
  checkId: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrences: number;
  status: MonitorAlertStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  lastNotifiedAt?: string;
}

export interface MonitorThresholds {
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
}

export interface MonitorSettings {
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
}

export interface SubsystemItem {
  id: string;
  name: string;
  status: MonitorCheckStatus;
  configured: boolean;
  summary: string;
  latencyMs?: number;
  metrics: Record<string, string | number | boolean | null>;
  warnings?: string[];
}

export interface SubsystemInventory {
  collectedAt: string;
  durationMs: number;
  items: SubsystemItem[];
  cronJobs: CronJobHeartbeat[];
}

export type MonitorOverallStatus = 'healthy' | 'degraded' | 'critical';

export interface MonitorRunResult {
  generatedAt: string;
  overall: MonitorOverallStatus;
  checks: MonitorCheckResult[];
  raisedAlerts: MonitorAlert[];
  resolvedAlerts: MonitorAlert[];
}

export interface MonitorChannelsSummary {
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
}

/** Ответ GET /api/diagnostics/monitor/status. */
export interface MonitorStatusResponse {
  generatedAt: string;
  overall: MonitorOverallStatus;
  watchdog: { enabled: boolean; intervalSec: number; lastRunAt: string | null; lastRun: MonitorRunResult | null };
  metrics: MonitorMetricsSnapshot;
  checks: MonitorCheckResult[];
  activeAlerts: MonitorAlert[];
  alertHistory: MonitorAlert[];
  channels: MonitorChannelsSummary;
  settings: MonitorSettings;
  subsystems?: SubsystemInventory;
}
