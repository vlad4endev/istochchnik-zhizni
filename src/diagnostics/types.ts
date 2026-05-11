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
