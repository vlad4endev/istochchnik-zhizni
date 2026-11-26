import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import Redis from 'ioredis';
import { chatCompletion } from '../../ai/llmClient';
import { pool } from '../../config/db';
import { isSupabaseStorageConfigured } from '../../lib/supabaseStorage';
import { requireAuthSession } from '../../middleware/authSession';
import { requireAdmin } from '../../middleware/requireAdmin';
import { listAppLogs } from '../../services/appLogService';
import { analyzeAutomatedTestFailures } from '../analyzers/autoTestFailureAnalyzer';
import { analyzeCodeWithClaude } from '../analyzers/codeAnalyzer';
import { resolveSafeScanDir, scanProject } from '../analyzers/projectScanner';
import { collectServerDiagnostics } from '../analyzers/serverAnalyzer';
import { resolveInternalBaseUrl, runAutomatedTestSuite } from '../autoTestSuite';
import { collectSubsystemInventory } from '../monitor/checks';
import { loadMonitorSettings } from '../monitor/settings';
import {
  acknowledgeMonitorAlert,
  applyMonitorSettingsUpdate,
  getMonitorStatus,
  resolveMonitorAlert,
  runMonitorNow,
  sendMonitorTestAlert,
} from '../monitor/watchdog';
import type {
  AutomatedTestsReport,
  DiagnosticIssue,
  FullDiagnosticsReport,
  ProjectAuditResult,
  ServerDiagnosticResult,
  SubsystemInventory,
} from '../types';

export const diagnosticsRouter = Router();
diagnosticsRouter.use(requireAuthSession, requireAdmin);

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Ответ модели не содержит JSON');
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

interface DeterministicAuditInput {
  description: string;
  checks: FullDiagnosticsReport['readiness']['checks'];
  automatedTests?: AutomatedTestsReport;
  server: ServerDiagnosticResult;
  eventLoopLagMs: number;
  errorRate: number;
  p95Ms: number;
  subsystems?: SubsystemInventory;
}

/**
 * Детерминированный технический аудит: всегда вычисляет честный score 0–100
 * и реальные проблемы/рекомендации на основе фактических метрик — без зависимости от LLM.
 */
export function buildDeterministicAudit(input: DeterministicAuditInput): ProjectAuditResult {
  let score = 100;
  const issues: DiagnosticIssue[] = [];
  const recommendations: string[] = [];

  const addIssue = (
    severity: DiagnosticIssue['severity'],
    penalty: number,
    title: string,
    description: string,
    suggestion: string,
    category: string,
  ) => {
    score -= penalty;
    issues.push({
      id: `det-${issues.length + 1}`,
      severity,
      title,
      description,
      suggestion,
      category,
    });
    recommendations.push(suggestion);
  };

  for (const check of input.checks) {
    if (check.status === 'failed') {
      addIssue(
        'CRITICAL',
        18,
        `Провалена проверка: ${check.name}`,
        check.details,
        `Устраните причину сбоя проверки «${check.name}» и повторите диагностику.`,
        'readiness',
      );
    } else if (check.status === 'warning') {
      addIssue(
        'MEDIUM',
        7,
        `Предупреждение: ${check.name}`,
        check.details,
        `Проверьте параметры и состояние узла «${check.name}».`,
        'readiness',
      );
    }
  }

  if (input.automatedTests) {
    const critFailed = input.automatedTests.results.filter(
      (t) => t.tier === 'critical' && t.status === 'failed',
    );
    const stdFailed = input.automatedTests.results.filter(
      (t) => t.tier === 'standard' && t.status === 'failed',
    );
    if (critFailed.length > 0) {
      addIssue(
        'CRITICAL',
        Math.min(30, critFailed.length * 12),
        `Провалено критичных автотестов: ${critFailed.length}`,
        critFailed.map((t) => `${t.name}: ${t.message}`).join('; '),
        'Откройте раздел «Автотесты», изучите ответы сервера и запустите ИИ-разбор провалов.',
        'tests',
      );
    }
    if (stdFailed.length > 0) {
      addIssue(
        'HIGH',
        Math.min(18, stdFailed.length * 5),
        `Провалено стандартных автотестов: ${stdFailed.length}`,
        stdFailed.map((t) => `${t.name}: ${t.message}`).join('; '),
        'Проверьте проваленные эндпоинты и права доступа.',
        'tests',
      );
    }
  }

  if (input.server.memory.usagePercent >= 90) {
    addIssue(
      'HIGH',
      12,
      `Высокое потребление RAM (${input.server.memory.usagePercent.toFixed(1)}%)`,
      'Доступная оперативная память сервера близка к исчерпанию.',
      'Проверьте потребление памяти контейнерами и при необходимости увеличьте RAM.',
      'resources',
    );
  }
  if (input.server.disk && input.server.disk.usagePercent >= 85) {
    addIssue(
      input.server.disk.usagePercent >= 93 ? 'CRITICAL' : 'HIGH',
      input.server.disk.usagePercent >= 93 ? 20 : 10,
      `Диск заполнен на ${input.server.disk.usagePercent.toFixed(1)}%`,
      `Точка монтирования ${input.server.disk.mountPoint}: осталось ${(input.server.disk.availableKb / 1024 / 1024).toFixed(2)} GB.`,
      'Очистите старые локальные бекапы, логи Docker или расширьте том.',
      'resources',
    );
  }
  if (input.eventLoopLagMs >= 100) {
    addIssue(
      input.eventLoopLagMs >= 400 ? 'CRITICAL' : 'MEDIUM',
      input.eventLoopLagMs >= 400 ? 15 : 6,
      `Задержка Event Loop: ${input.eventLoopLagMs} ms`,
      'Главный поток Node.js блокируется синхронными операциями или высокой нагрузкой.',
      'Найдите блокирующие операции в горячих маршрутах или вынесите тяжёлые задачи.',
      'performance',
    );
  }
  if (input.errorRate >= 0.05) {
    addIssue(
      input.errorRate >= 0.15 ? 'HIGH' : 'MEDIUM',
      input.errorRate >= 0.15 ? 14 : 6,
      `Повышенная доля ошибок в журнале: ${(input.errorRate * 100).toFixed(1)}%`,
      'В последних записях журнала app_logs заметная доля ошибок уровня error.',
      'Откройте журнал ошибок и проверьте проблемные маршруты во вкладке мониторинга.',
      'reliability',
    );
  }
  if (input.p95Ms >= 1500) {
    addIssue(
      'MEDIUM',
      8,
      `Высокая латентность HTTP p95: ${input.p95Ms.toFixed(0)} ms`,
      'Часть запросов API выполняется дольше 1.5 секунд.',
      'Проверьте медленные маршруты в таблице «Самые медленные эндпоинты» и индексы PostgreSQL.',
      'performance',
    );
  }

  if (input.subsystems) {
    for (const sub of input.subsystems.items) {
      if (sub.status === 'fail' && sub.configured) {
        addIssue(
          sub.id === 'postgres' ? 'CRITICAL' : 'HIGH',
          sub.id === 'postgres' ? 25 : 10,
          `Сбой подсистемы: ${sub.name}`,
          sub.summary,
          sub.warnings?.[0] ?? `Проверьте конфигурацию и доступность «${sub.name}».`,
          'subsystems',
        );
      } else if (sub.warnings && sub.warnings.length > 0) {
        addIssue(
          'LOW',
          3,
          `Предупреждение подсистемы: ${sub.name}`,
          sub.warnings.join('; '),
          `Проверьте раздел настроек для «${sub.name}».`,
          'subsystems',
        );
      }
    }
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const critCount = issues.filter((i) => i.severity === 'CRITICAL').length;
  const highCount = issues.filter((i) => i.severity === 'HIGH').length;
  const summary =
    issues.length === 0
      ? `Все ключевые проверки, ресурсы и подсистемы в норме. Итоговый индекс здоровья: ${clampedScore}/100.`
      : `Индекс здоровья: ${clampedScore}/100. Найдено замечаний: ${issues.length} (критичных: ${critCount}, высоких: ${highCount}).`;

  return {
    timestamp: new Date().toISOString(),
    description: input.description,
    overallScore: clampedScore,
    summary,
    issues,
    recommendations: Array.from(new Set(recommendations)).slice(0, 12),
    fallback: false,
  };
}

/**
 * Обогащает детерминированный аудит выводами от настроенного в админке LLM-провайдера.
 * Если ИИ выключен или недоступен — возвращает полный и честный детерминированный аудит.
 */
async function runSmartAudit(
  input: DeterministicAuditInput,
  rawPayload: unknown,
): Promise<ProjectAuditResult> {
  const baseline = buildDeterministicAudit(input);

  const prompt = [
    'You are a senior SRE and Node.js/TypeScript architect.',
    'Review the diagnostics snapshot below and provide concise Russian engineering insights.',
    'Return PURE JSON only (no markdown fences).',
    'Schema:',
    '{ "summary": string, "recommendations": string[], "extraIssues": [{ "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "title": string, "description": string, "suggestion": string, "category": string }] }',
    `Audit focus: ${input.description}`,
    JSON.stringify(rawPayload, null, 2).slice(0, 12000),
  ].join('\n');

  try {
    const text = await chatCompletion([{ role: 'user', content: prompt }], {
      skipSystemPrompt: true,
      max_tokens: 1200,
      temperature: 0.2,
    });
    const parsed = extractJson(text) as {
      summary?: unknown;
      recommendations?: unknown;
      extraIssues?: unknown;
    };
    const aiSummary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null;
    const aiRecs = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.map((item) => String(item).trim()).filter(Boolean)
      : [];
    const aiIssues: DiagnosticIssue[] = Array.isArray(parsed.extraIssues)
      ? parsed.extraIssues.slice(0, 6).map((issue, idx) => {
          const typed = issue as Record<string, unknown>;
          const sev = String(typed.severity ?? 'LOW').toUpperCase();
          return {
            id: `ai-${idx + 1}`,
            severity:
              sev === 'CRITICAL' || sev === 'HIGH' || sev === 'MEDIUM' || sev === 'LOW'
                ? sev
                : 'LOW',
            title: String(typed.title ?? 'Замечание ИИ'),
            description: String(typed.description ?? ''),
            suggestion: String(typed.suggestion ?? ''),
            category: String(typed.category ?? 'ai-review'),
          };
        })
      : [];

    return {
      ...baseline,
      summary: aiSummary ? `${baseline.summary}\n\nAI-вывод: ${aiSummary}` : baseline.summary,
      issues: [...baseline.issues, ...aiIssues],
      recommendations: Array.from(new Set([...baseline.recommendations, ...aiRecs])).slice(0, 15),
      fallback: false,
    };
  } catch {
    return baseline;
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
    const timer = setTimeout(() => {
      const drift = performance.now() - started - sampleMs;
      resolve(Number(Math.max(0, drift).toFixed(2)));
    }, sampleMs);
    timer.unref?.();
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

async function buildJournalAnalysisAndP95() {
  const logs = await listAppLogs({ limit: 200, offset: 0 });
  const byLevel = { info: 0, warn: 0, error: 0 };
  const eventCounts = new Map<string, number>();
  const durations: number[] = [];

  for (const log of logs) {
    if (log.level === 'info') byLevel.info += 1;
    else if (log.level === 'warn') byLevel.warn += 1;
    else if (log.level === 'error') byLevel.error += 1;
    eventCounts.set(log.event, (eventCounts.get(log.event) ?? 0) + 1);
    const dur = Number(log.duration_ms ?? 0);
    if (Number.isFinite(dur) && dur > 0) durations.push(dur);
  }

  const topEvents = Array.from(eventCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([event, count]) => ({ event, count }));

  const recentErrors = logs
    .filter((log) => log.level === 'error')
    .slice(0, 10)
    .map((log) => ({
      message: log.message,
      created_at: log.created_at,
      scope: log.scope,
    }));

  return {
    journal: {
      total: logs.length,
      byLevel,
      topEvents,
      recentErrors,
    },
    p95: percentile(durations, 95),
  };
}

function buildEnvironmentSummary() {
  const keys = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'MESSAGE_ENCRYPTION_KEY',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LIVEKIT_URL',
    'VAPID_PUBLIC_KEY',
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
    return { configured: false, reachable: false, details: 'REDIS_URL не задан (опционально)' };
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
    return { configured: false, reachable: false, details: 'Не настроено (опционально)' };
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
  const baseUrl = resolveInternalBaseUrl(req);
  const environment = buildEnvironmentSummary();

  const [
    automatedMeasured,
    healthMeasured,
    serverMeasured,
    scanMeasured,
    journalMeasured,
    eventLoopLagMs,
    redisStatus,
    supabaseStatus,
    subsystems,
  ] = await Promise.all([
    measure(async () => runAutomatedTestSuite(baseUrl, req)),
    measure(async () => {
      if (!pool) {
        return { ok: false, details: 'DATABASE_URL не задан — БД не подключена' };
      }
      try {
        await pool.query('SELECT 1');
        return { ok: true, details: 'Подключение к PostgreSQL успешно' };
      } catch (err) {
        return {
          ok: false,
          details: `Ошибка БД: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }),
    measure(async () => collectServerDiagnostics()),
    measure(async () => scanProject(process.cwd())),
    measure(async () => buildJournalAnalysisAndP95()),
    sampleEventLoopLag(120),
    checkRedisConnectivity(),
    checkSupabaseConnectivity(),
    collectSubsystemInventory(),
  ]);

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

  checks.push({
    name: 'Database connectivity',
    status: healthMeasured.value.ok ? 'passed' : 'failed',
    details: healthMeasured.value.details,
    durationMs: healthMeasured.durationMs,
  });

  checks.push({
    name: 'Server metrics',
    status:
      serverMeasured.value.cpu.usagePercent > 90 || serverMeasured.value.memory.usagePercent > 90
        ? 'warning'
        : 'passed',
    details: `CPU ${serverMeasured.value.cpu.usagePercent.toFixed(1)}%, RAM ${serverMeasured.value.memory.usagePercent.toFixed(1)}%${serverMeasured.value.disk ? `, Disk ${serverMeasured.value.disk.usagePercent.toFixed(1)}%` : ''}`,
    durationMs: serverMeasured.durationMs,
  });

  checks.push({
    name: 'Project scan',
    status: scanMeasured.value.filesScanned > 0 ? 'passed' : 'failed',
    details: `Файлов: ${scanMeasured.value.filesScanned}, LOC: ${scanMeasured.value.linesOfCode}, тесты: ${scanMeasured.value.hasTests ? 'да' : 'нет'}`,
    durationMs: scanMeasured.durationMs,
  });

  const journal = journalMeasured.value.journal;
  const p95 = journalMeasured.value.p95;
  checks.push({
    name: 'Journal analysis',
    status:
      journal.total >= 10 && journal.byLevel.error / journal.total > 0.15 ? 'warning' : 'passed',
    details: `Логов: ${journal.total}, ошибок: ${journal.byLevel.error}, p95: ${p95.toFixed(0)} ms`,
    durationMs: journalMeasured.durationMs,
  });

  checks.push({
    name: 'Event loop lag',
    status: eventLoopLagMs > 100 ? 'warning' : 'passed',
    details: `Lag: ${eventLoopLagMs} ms`,
    durationMs: 120,
  });

  checks.push({
    name: 'Redis integration',
    status: !redisStatus.configured ? 'passed' : redisStatus.reachable ? 'passed' : 'failed',
    details: redisStatus.details,
    durationMs: 0,
  });

  checks.push({
    name: 'Supabase integration',
    status: !supabaseStatus.configured ? 'passed' : supabaseStatus.reachable ? 'passed' : 'failed',
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

  const currentErrorRate = journal.total > 0 ? journal.byLevel.error / journal.total : 0;

  const auditPayload = {
    description,
    checks,
    automatedTestsSummary: {
      overall: automatedTests.overall,
      passed: automatedTests.summary.passed,
      total: automatedTests.summary.total,
      failedCases: automatedTests.results
        .filter((t) => t.status === 'failed')
        .map((t) => ({ id: t.id, name: t.name, tier: t.tier, message: t.message })),
    },
    server: serverMeasured.value,
    subsystems: subsystems.items.map((s) => ({
      name: s.name,
      status: s.status,
      summary: s.summary,
      warnings: s.warnings,
    })),
    journal,
    eventLoopLagMs,
  };

  const audit = await runSmartAudit(
    {
      description,
      checks,
      automatedTests,
      server: serverMeasured.value,
      eventLoopLagMs,
      errorRate: currentErrorRate,
      p95Ms: p95,
      subsystems,
    },
    auditPayload,
  );

  const previousBaseline = await readBaseline();
  const regressionItems: string[] = [];
  if (previousBaseline) {
    if (
      p95 > previousBaseline.httpDurationP95Ms * 1.3 &&
      p95 - previousBaseline.httpDurationP95Ms > 40
    ) {
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
  if (checks.some((item) => item.status === 'failed')) {
    blockers.push('Есть проваленные обязательные проверки.');
  }
  if (environment.missingCritical.length > 0) {
    blockers.push(`Отсутствуют critical env: ${environment.missingCritical.join(', ')}`);
  }
  if (regressionItems.length > 0) {
    blockers.push('Обнаружена регрессия относительно прошлого запуска.');
  }

  await writeBaseline({
    generatedAt: new Date().toISOString(),
    httpDurationP95Ms: Number(p95.toFixed(2)),
    errorRate: currentErrorRate,
  });

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
    journal,
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
      'Отчёт построен на живых метриках, проверках подсистем, интеграционных тестах и журнале на момент запуска. При включённом ИИ в Интеграциях сводка автоматически дополняется рекомендациями LLM.',
  };
}

// ─── Базовые эндпоинты диагностики ───────────────────────────────────────

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

diagnosticsRouter.get('/subsystems', async (_req: Request, res: Response) => {
  try {
    const inventory = await collectSubsystemInventory();
    res.json(inventory);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось собрать состояние подсистем',
    });
  }
});

diagnosticsRouter.post('/audit', async (req: Request, res: Response) => {
  const description = String(req.body?.description ?? 'Общий аудит архитектуры и надёжности');
  const [scanSnapshot, serverSnapshot, subsystems, eventLoopLagMs, journalRes] = await Promise.all([
    scanProject(process.cwd()),
    collectServerDiagnostics(),
    collectSubsystemInventory(),
    sampleEventLoopLag(100),
    buildJournalAnalysisAndP95(),
  ]);
  const errorRate =
    journalRes.journal.total > 0 ? journalRes.journal.byLevel.error / journalRes.journal.total : 0;
  const audit = await runSmartAudit(
    {
      description,
      checks: [],
      server: serverSnapshot,
      eventLoopLagMs,
      errorRate,
      p95Ms: journalRes.p95,
      subsystems,
    },
    { description, scanSnapshot, serverSnapshot, subsystems },
  );
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
      error: error instanceof Error ? error.message : 'Не удалось сформировать полный отчёт',
    });
  }
});

diagnosticsRouter.post('/auto-tests', async (req: Request, res: Response) => {
  try {
    const baseUrl = resolveInternalBaseUrl(req);
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

// ─── Мониторинг в реальном времени и система оповещений ──────────────────

diagnosticsRouter.get('/monitor/status', async (req: Request, res: Response) => {
  try {
    const includeSubsystems = req.query.subsystems === '1' || req.query.subsystems === 'true';
    const status = await getMonitorStatus(includeSubsystems);
    res.json(status);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось получить статус мониторинга',
    });
  }
});

diagnosticsRouter.post('/monitor/run', async (_req: Request, res: Response) => {
  try {
    const run = await runMonitorNow();
    res.json(run);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить цикл мониторинга',
    });
  }
});

diagnosticsRouter.get('/monitor/settings', async (_req: Request, res: Response) => {
  try {
    const settings = await loadMonitorSettings(true);
    res.json(settings);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось загрузить настройки мониторинга',
    });
  }
});

diagnosticsRouter.patch('/monitor/settings', async (req: Request, res: Response) => {
  try {
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const updated = await applyMonitorSettingsUpdate(patch);
    res.json(updated);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Не удалось сохранить настройки мониторинга',
    });
  }
});

diagnosticsRouter.post('/monitor/alerts/:key/acknowledge', (req: Request, res: Response) => {
  const key = String(req.params.key ?? '').trim();
  if (!key) {
    res.status(400).json({ error: 'Не указан ключ алерта' });
    return;
  }
  const authReq = req as Request & { authUserId?: number };
  const actor = authReq.authUserId ? `admin#${authReq.authUserId}` : 'admin';
  const alert = acknowledgeMonitorAlert(key, actor);
  if (!alert) {
    res.status(404).json({ error: 'Активный алерт с таким ключом не найден' });
    return;
  }
  res.json(alert);
});

diagnosticsRouter.post('/monitor/alerts/:key/resolve', (req: Request, res: Response) => {
  const key = String(req.params.key ?? '').trim();
  if (!key) {
    res.status(400).json({ error: 'Не указан ключ алерта' });
    return;
  }
  const alert = resolveMonitorAlert(key);
  if (!alert) {
    res.status(404).json({ error: 'Активный алерт с таким ключом не найден' });
    return;
  }
  res.json(alert);
});

diagnosticsRouter.post('/monitor/test-alert', async (_req: Request, res: Response) => {
  try {
    const result = await sendMonitorTestAlert();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Не удалось отправить тестовое оповещение',
    });
  }
});
