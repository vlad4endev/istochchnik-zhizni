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
