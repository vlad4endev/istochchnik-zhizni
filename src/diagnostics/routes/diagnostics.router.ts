import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import Redis from 'ioredis';
import { analyzeCodeWithClaude } from '../analyzers/codeAnalyzer';
import { collectServerDiagnostics } from '../analyzers/serverAnalyzer';
import { resolveSafeScanDir, scanProject } from '../analyzers/projectScanner';
import { analyzeAutomatedTestFailures } from '../analyzers/autoTestFailureAnalyzer';
import { runAutomatedTestSuite } from '../autoTestSuite';
import { FullDiagnosticsReport, ProjectAuditResult, type AutomatedTestsReport } from '../types';
import { pool } from '../../config/db';
import { requireAuthSession } from '../../middleware/authSession';
import { requireAdmin } from '../../middleware/requireAdmin';
import { listAppLogs } from '../../services/appLogService';
import { isSupabaseStorageConfigured } from '../../lib/supabaseStorage';

export const diagnosticsRouter = Router();
diagnosticsRouter.use(requireAuthSession, requireAdmin);

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Claude response does not contain JSON payload');
  }
  return JSON.parse(candidate);
}

async function resolveVersion(): Promise<string> {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function runAuditWithClaude(description: string, payload: unknown): Promise<ProjectAuditResult> {
  const fallback: ProjectAuditResult = {
    timestamp: new Date().toISOString(),
    description,
    overallScore: 50,
    summary: 'AI-аудит недоступен, возвращен базовый результат.',
    issues: [],
    recommendations: ['Проверьте ANTHROPIC_API_KEY и повторите аудит.'],
    fallback: true,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      summary: 'AI-аудит недоступен: не задан ANTHROPIC_API_KEY.',
    };
  }

  const prompt = [
    'You are a senior Node.js/TypeScript architect.',
    'Perform a full architecture audit based on provided diagnostics snapshots.',
    'Return PURE JSON only (no markdown fences).',
    'Schema:',
    '{',
    '  "overallScore": number,',
    '  "summary": string,',
    '  "recommendations": string[],',
    '  "issues": [{',
    '    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",',
    '    "title": string,',
    '    "description": string,',
    '    "suggestion": string,',
    '    "category": string',
    '  }]',
    '}',
    `Audit focus: ${description}`,
    JSON.stringify(payload, null, 2),
  ].join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return {
        ...fallback,
        summary: `AI-аудит недоступен: HTTP ${response.status}.`,
        recommendations: [`Ответ API: ${body.slice(0, 300)}`],
      };
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.map((item) => item.text ?? '').join('\n') ?? '';
    const parsed = extractJson(text) as {
      overallScore?: unknown;
      summary?: unknown;
      recommendations?: unknown;
      issues?: unknown;
    };

    return {
      timestamp: new Date().toISOString(),
      description,
      overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore ?? 50))),
      summary: String(parsed.summary ?? 'AI-аудит выполнен.'),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((item) => String(item))
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue, index) => {
            const typed = issue as Record<string, unknown>;
            const severity = String(typed.severity ?? 'LOW');
            return {
              id: `audit-${index + 1}`,
              severity:
                severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM' || severity === 'LOW'
                  ? severity
                  : 'LOW',
              title: String(typed.title ?? 'Без названия'),
              description: String(typed.description ?? ''),
              suggestion: String(typed.suggestion ?? ''),
              category: String(typed.category ?? 'general'),
            };
          })
        : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      summary: `AI-аудит недоступен: ${message}`,
    };
  }
}

async function measure<T>(fn: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const started = Date.now();
  const value = await fn();
  return { value, durationMs: Date.now() - started };
}

async function sampleEventLoopLag(sampleMs = 120): Promise<number> {
  const started = performance.now();
  return new Promise((resolve) => {
    setTimeout(() => {
      const drift = performance.now() - started - sampleMs;
      resolve(Number(Math.max(0, drift).toFixed(2)));
    }, sampleMs);
  });
}

async function buildJournalAnalysis() {
  const logs = await listAppLogs({ limit: 200, offset: 0 });
  const byLevel = { info: 0, warn: 0, error: 0 };
  const eventCounts = new Map<string, number>();
  for (const log of logs) {
    if (log.level === 'info') byLevel.info += 1;
    else if (log.level === 'warn') byLevel.warn += 1;
    else if (log.level === 'error') byLevel.error += 1;
    eventCounts.set(log.event, (eventCounts.get(log.event) ?? 0) + 1);
  }
  const topEvents = Array.from(eventCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([event, count]) => ({ event, count }));

  const recentErrors = logs
    .filter((log) => log.level === 'error')
    .slice(0, 8)
    .map((log) => ({
      message: log.message,
      created_at: log.created_at,
      scope: log.scope,
    }));

  return {
    total: logs.length,
    byLevel,
    topEvents,
    recentErrors,
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function buildEnvironmentSummary() {
  const keys = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'ANTHROPIC_API_KEY',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];
  const criticalEnv = keys.map((key) => ({
    key,
    present: Boolean(String(process.env[key] ?? '').trim()),
  }));
  const missingCritical = criticalEnv
    .filter((item) => !item.present && ['NODE_ENV', 'PORT', 'DATABASE_URL'].includes(item.key))
    .map((item) => item.key);
  return { criticalEnv, missingCritical };
}

async function checkRedisConnectivity(): Promise<{ configured: boolean; reachable: boolean; details: string }> {
  const redisUrl = String(process.env.REDIS_URL ?? '').trim();
  if (!redisUrl) {
    return { configured: false, reachable: false, details: 'REDIS_URL не задан' };
  }
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    return {
      configured: true,
      reachable: pong === 'PONG',
      details: pong === 'PONG' ? 'PING/PONG успешно' : `Неожиданный ответ: ${pong}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { configured: true, reachable: false, details: message };
  } finally {
    client.disconnect();
  }
}

async function checkSupabaseConnectivity(): Promise<{ configured: boolean; reachable: boolean; details: string }> {
  const url = String(process.env.SUPABASE_URL ?? '').trim();
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!isSupabaseStorageConfigured() || !url || !serviceRole) {
    return { configured: false, reachable: false, details: 'SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы' };
  }
  const target = `${url.replace(/\/+$/, '')}/rest/v1/`;
  try {
    const response = await fetch(target, {
      method: 'GET',
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });
    if (response.status < 500) {
      return { configured: true, reachable: true, details: `HTTP ${response.status}` };
    }
    return { configured: true, reachable: false, details: `HTTP ${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { configured: true, reachable: false, details: message };
  }
}

type BaselineSnapshot = {
  generatedAt: string;
  httpDurationP95Ms: number;
  errorRate: number;
};

const BASELINE_FILE = path.join(process.cwd(), '.diagnostics-baseline.json');

async function readBaseline(): Promise<BaselineSnapshot | null> {
  try {
    const raw = await fs.readFile(BASELINE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as BaselineSnapshot;
    if (!parsed?.generatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeBaseline(snapshot: BaselineSnapshot): Promise<void> {
  try {
    await fs.writeFile(BASELINE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch {
    // ignore baseline write failures
  }
}

function aggregateOverall(checks: FullDiagnosticsReport['readiness']['checks']): 'healthy' | 'degraded' | 'critical' {
  if (checks.some((item) => item.status === 'failed')) return 'critical';
  if (checks.some((item) => item.status === 'warning')) return 'degraded';
  return 'healthy';
}

async function runFullDiagnostics(description: string, req: Request): Promise<FullDiagnosticsReport> {
  const checks: FullDiagnosticsReport['readiness']['checks'] = [];
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const environment = buildEnvironmentSummary();

  const automatedMeasured = await measure(async () => runAutomatedTestSuite(baseUrl, req));
  const automatedTests = automatedMeasured.value;
  checks.push({
    name: 'Интеграционные автотесты',
    status:
      automatedTests.overall === 'failed'
        ? 'failed'
        : automatedTests.overall === 'degraded'
          ? 'warning'
          : 'passed',
    details: `${automatedTests.summary.passed}/${automatedTests.summary.total} ок · критич.: ${automatedTests.results.filter((t) => t.tier === 'critical' && t.status === 'failed').length} провал.`,
    durationMs: automatedMeasured.durationMs,
  });

  const healthMeasured = await measure(async () => {
    if (!pool) {
      return { ok: true, details: 'DATABASE_URL не задан, БД-проверка пропущена' };
    }
    await pool.query('SELECT 1');
    return { ok: true, details: 'Подключение к PostgreSQL успешно' };
  });
  checks.push({
    name: 'Database connectivity',
    status: healthMeasured.value.ok ? 'passed' : 'failed',
    details: healthMeasured.value.details,
    durationMs: healthMeasured.durationMs,
  });

  const serverMeasured = await measure(async () => collectServerDiagnostics());
  checks.push({
    name: 'Server metrics',
    status:
      (serverMeasured.value.cpu.usagePercent > 90 || serverMeasured.value.memory.usagePercent > 92)
        ? 'warning'
        : 'passed',
    details: `CPU ${serverMeasured.value.cpu.usagePercent.toFixed(1)}%, RAM ${serverMeasured.value.memory.usagePercent.toFixed(1)}%`,
    durationMs: serverMeasured.durationMs,
  });

  const scanMeasured = await measure(async () => scanProject(process.cwd()));
  checks.push({
    name: 'Project scan',
    status: scanMeasured.value.filesScanned > 0 ? 'passed' : 'failed',
    details: `Просканировано файлов: ${scanMeasured.value.filesScanned}, LOC: ${scanMeasured.value.linesOfCode}`,
    durationMs: scanMeasured.durationMs,
  });

  const journalMeasured = await measure(async () => buildJournalAnalysis());
  const p95 = percentile(
    (await listAppLogs({ limit: 300, offset: 0 })).map((log) => Number(log.duration_ms ?? 0)).filter((v) => Number.isFinite(v) && v > 0),
    95,
  );
  checks.push({
    name: 'Journal analysis',
    status:
      journalMeasured.value.total > 0 && journalMeasured.value.byLevel.error / journalMeasured.value.total > 0.15
        ? 'warning'
        : 'passed',
    details: `Логов: ${journalMeasured.value.total}, ошибок: ${journalMeasured.value.byLevel.error}`,
    durationMs: journalMeasured.durationMs,
  });

  const eventLoopLagMs = await sampleEventLoopLag(120);
  checks.push({
    name: 'Event loop lag',
    status: eventLoopLagMs > 70 ? 'warning' : 'passed',
    details: `Lag: ${eventLoopLagMs} ms`,
    durationMs: 120,
  });

  const [redisStatus, supabaseStatus] = await Promise.all([
    checkRedisConnectivity(),
    checkSupabaseConnectivity(),
  ]);
  checks.push({
    name: 'Redis integration',
    status: !redisStatus.configured ? 'warning' : redisStatus.reachable ? 'passed' : 'failed',
    details: redisStatus.details,
    durationMs: 0,
  });
  checks.push({
    name: 'Supabase integration',
    status: !supabaseStatus.configured ? 'warning' : supabaseStatus.reachable ? 'passed' : 'failed',
    details: supabaseStatus.details,
    durationMs: 0,
  });
  checks.push({
    name: 'Critical env',
    status: environment.missingCritical.length === 0 ? 'passed' : 'failed',
    details:
      environment.missingCritical.length === 0
        ? 'Все критичные env заданы'
        : `Отсутствуют: ${environment.missingCritical.join(', ')}`,
    durationMs: 0,
  });

  const auditPayload = {
    description,
    checks,
    automatedTestsSummary: {
      overall: automatedTests.overall,
      passed: automatedTests.summary.passed,
      total: automatedTests.summary.total,
      failedCases: automatedTests.results
        .filter((t) => t.status === 'failed')
        .map((t) => ({ id: t.id, name: t.name, tier: t.tier })),
    },
    server: serverMeasured.value,
    project: scanMeasured.value,
    journal: journalMeasured.value,
    eventLoopLagMs,
  };
  const audit = await runAuditWithClaude(description, auditPayload);

  const currentErrorRate =
    journalMeasured.value.total > 0 ? journalMeasured.value.byLevel.error / journalMeasured.value.total : 0;
  const previousBaseline = await readBaseline();
  const regressionItems: string[] = [];
  if (previousBaseline) {
    if (p95 > previousBaseline.httpDurationP95Ms * 1.3 && p95 - previousBaseline.httpDurationP95Ms > 40) {
      regressionItems.push(
        `p95 вырос: ${previousBaseline.httpDurationP95Ms.toFixed(2)}ms -> ${p95.toFixed(2)}ms`,
      );
    }
    if (currentErrorRate > previousBaseline.errorRate + 0.05) {
      regressionItems.push(
        `error rate вырос: ${(previousBaseline.errorRate * 100).toFixed(1)}% -> ${(currentErrorRate * 100).toFixed(1)}%`,
      );
    }
  }

  const blockers: string[] = [];
  if (checks.some((item) => item.status === 'failed')) blockers.push('Есть проваленные обязательные проверки.');
  if (environment.missingCritical.length > 0) blockers.push(`Отсутствуют critical env: ${environment.missingCritical.join(', ')}`);
  if (regressionItems.length > 0) blockers.push('Обнаружена регрессия относительно прошлого запуска.');

  const baselineToWrite: BaselineSnapshot = {
    generatedAt: new Date().toISOString(),
    httpDurationP95Ms: Number(p95.toFixed(2)),
    errorRate: currentErrorRate,
  };
  await writeBaseline(baselineToWrite);

  return {
    generatedAt: new Date().toISOString(),
    readiness: {
      overall: aggregateOverall(checks),
      checks,
    },
    environment,
    automatedTests,
    smoke: {
      baseUrl,
      endpoints: automatedTests.smokeEndpoints,
    },
    integrations: {
      redis: redisStatus,
      supabase: supabaseStatus,
    },
    server: serverMeasured.value,
    project: scanMeasured.value,
    performance: {
      eventLoopLagMs,
      healthCheckMs: healthMeasured.durationMs,
      serverCheckMs: serverMeasured.durationMs,
      scanCheckMs: scanMeasured.durationMs,
      httpDurationP95Ms: Number(p95.toFixed(2)),
    },
    journal: journalMeasured.value,
    audit,
    releaseValidation: {
      pass: blockers.length === 0,
      blockers,
    },
    regression: {
      hasRegression: regressionItems.length > 0,
      items: regressionItems,
      previous: previousBaseline
        ? {
            generatedAt: previousBaseline.generatedAt,
            httpDurationP95Ms: previousBaseline.httpDurationP95Ms,
            errorRate: previousBaseline.errorRate,
          }
        : undefined,
    },
    truthfulnessNote:
      'Отчет основан на реальных метриках и логах на момент запуска. Это честный технический снимок текущего состояния, но не абсолютная гарантия 100% отсутствия скрытых дефектов.',
  };
}

diagnosticsRouter.get('/health', async (_req: Request, res: Response) => {
  const version = await resolveVersion();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version,
  });
});

diagnosticsRouter.post('/analyze', async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? '').trim();
  const mode = String(req.body?.mode ?? 'general');
  const language = String(req.body?.language ?? 'typescript');

  if (!code) {
    res.status(400).json({ error: 'Поле code обязательно' });
    return;
  }

  const result = await analyzeCodeWithClaude({ code, mode, language });
  res.json(result);
});

diagnosticsRouter.get('/server', async (_req: Request, res: Response) => {
  const result = await collectServerDiagnostics();
  res.json(result);
});

diagnosticsRouter.get('/scan', async (req: Request, res: Response) => {
  try {
    const rootDir = process.cwd();
    const subdir = typeof req.query.subdir === 'string' ? req.query.subdir : undefined;
    const safeDir = resolveSafeScanDir(rootDir, subdir);
    const result = await scanProject(safeDir);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить сканирование',
    });
  }
});

diagnosticsRouter.post('/audit', async (req: Request, res: Response) => {
  const description = String(req.body?.description ?? 'General architecture and reliability audit');
  const scanSnapshot = await scanProject(process.cwd());
  const serverSnapshot = await collectServerDiagnostics();
  const payload = {
    description,
    scanSnapshot,
    serverSnapshot,
  };
  const audit = await runAuditWithClaude(description, payload);
  audit.scanSnapshot = scanSnapshot;
  audit.serverSnapshot = serverSnapshot;
  res.json(audit);
});

diagnosticsRouter.post('/full-report', async (req: Request, res: Response) => {
  const description = String(req.body?.description ?? 'Полная проверка здоровья проекта');
  try {
    const report = await runFullDiagnostics(description, req);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось сформировать полный отчет',
    });
  }
});

diagnosticsRouter.post('/auto-tests', async (req: Request, res: Response) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const report = await runAutomatedTestSuite(baseUrl, req);
    res.json(report);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить автотесты',
    });
  }
});

diagnosticsRouter.post('/auto-tests/analyze-failures', async (req: Request, res: Response) => {
  const payload = req.body?.automatedTests as AutomatedTestsReport | undefined;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.results)) {
    res.status(400).json({ error: 'Тело запроса должно содержать automatedTests с массивом results' });
    return;
  }
  try {
    const analysis = await analyzeAutomatedTestFailures(payload);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить ИИ-анализ',
    });
  }
});
