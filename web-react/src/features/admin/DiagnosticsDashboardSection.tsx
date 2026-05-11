import { useMemo, useState } from 'react';
import { apiClient } from '../../lib/apiClient';

type ServerPayload = {
  cpu?: { usagePercent?: number };
  memory?: { usagePercent?: number; usedBytes?: number; totalBytes?: number };
  disk?: { usagePercent?: number; usedKb?: number; totalKb?: number } | null;
  runtime?: { env?: string; nodeVersion?: string; pid?: number; processUptimeSec?: number };
  recommendations?: string[];
};

type ScanPayload = {
  filesScanned: number;
  directoriesScanned: number;
  linesOfCode: number;
  byExtension: Record<string, number>;
  topLargestFiles: Array<{ path: string; sizeBytes: number; lines: number }>;
  packageDependenciesCount: number;
  packageDevDependenciesCount: number;
};

type AuditIssue = {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  suggestion: string;
};

type AuditPayload = {
  overallScore: number;
  summary: string;
  recommendations: string[];
  issues: AuditIssue[];
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
    overall: 'healthy' | 'degraded' | 'critical';
    checks: Array<{ name: string; status: 'passed' | 'warning' | 'failed'; details: string; durationMs: number }>;
  };
  automatedTests: AutomatedTestsPayload;
  server: ServerPayload;
  project: ScanPayload;
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
  smoke: {
    baseUrl: string;
    endpoints: Array<{ path: string; ok: boolean; status: number; durationMs: number; note?: string }>;
  };
  integrations: {
    redis: { configured: boolean; reachable: boolean; details: string };
    supabase: { configured: boolean; reachable: boolean; details: string };
  };
  journal: {
    total: number;
    byLevel: { info: number; warn: number; error: number };
    topEvents: Array<{ event: string; count: number }>;
    recentErrors: Array<{ message: string; created_at: string; scope: string }>;
  };
  audit: AuditPayload;
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

function severityClass(severity: AuditIssue['severity']): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-red-50';
  if (severity === 'MEDIUM') return 'bg-amber-50';
  return 'bg-[var(--surface)]';
}

function severityBadgeClass(severity: AuditIssue['severity']): string {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-red-100 text-red-700';
  if (severity === 'MEDIUM') return 'bg-amber-100 text-amber-800';
  return 'bg-stone-200 text-[var(--text-secondary)]';
}

function scoreClass(score: number): string {
  if (score >= 75) return 'text-emerald-700';
  if (score >= 45) return 'text-amber-700';
  return 'text-red-700';
}

function suiteOverallClass(overall: AutomatedTestsPayload['overall']): string {
  if (overall === 'passed') return 'text-emerald-700';
  if (overall === 'degraded') return 'text-amber-700';
  return 'text-red-600';
}

function tierBadgeClass(tier: AutomatedTestsPayload['results'][number]['tier']): string {
  if (tier === 'critical') return 'bg-red-100 text-red-800';
  if (tier === 'standard') return 'bg-stone-200 text-stone-800';
  return 'bg-stone-100 text-stone-600';
}

export function DiagnosticsDashboardSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [report, setReport] = useState<FullReportPayload | null>(null);
  const [autoSuite, setAutoSuite] = useState<AutomatedTestsPayload | null>(null);
  const [failureAnalysis, setFailureAnalysis] = useState<FailureAnalysisPayload | null>(null);
  const [aiAnalyzeLoading, setAiAnalyzeLoading] = useState(false);
  const [description, setDescription] = useState('Полный аудит состояния проекта и инфраструктуры');

  async function runFullAnalysis(): Promise<void> {
    setIsLoading(true);
    setErrorText(null);
    setFailureAnalysis(null);
    try {
      const full = await apiClient.post<FullReportPayload>('/api/diagnostics/full-report', { description });
      setReport(full.data);
      setAutoSuite(full.data.automatedTests);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось выполнить диагностику');
    } finally {
      setIsLoading(false);
    }
  }

  async function runAutoTestsOnly(): Promise<void> {
    setAutoLoading(true);
    setErrorText(null);
    setFailureAnalysis(null);
    try {
      const res = await apiClient.post<AutomatedTestsPayload>('/api/diagnostics/auto-tests');
      setAutoSuite(res.data);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось выполнить автотесты');
    } finally {
      setAutoLoading(false);
    }
  }

  async function runAiFailureAnalysis(): Promise<void> {
    if (!autoSuite) return;
    setAiAnalyzeLoading(true);
    setErrorText(null);
    try {
      const res = await apiClient.post<FailureAnalysisPayload>('/api/diagnostics/auto-tests/analyze-failures', {
        automatedTests: autoSuite,
      });
      setFailureAnalysis(res.data);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось выполнить ИИ-анализ');
    } finally {
      setAiAnalyzeLoading(false);
    }
  }

  const suiteByCategory = useMemo(() => {
    if (!autoSuite) return {} as Record<string, AutomatedTestsPayload['results']>;
    const map: Record<string, AutomatedTestsPayload['results']> = {};
    for (const row of autoSuite.results) {
      if (!map[row.category]) map[row.category] = [];
      map[row.category]!.push(row);
    }
    return map;
  }, [autoSuite]);

  const readinessDisplay = useMemo(() => {
    if (report?.readiness?.overall) return report.readiness.overall;
    if (!autoSuite) return null;
    if (autoSuite.overall === 'passed') return 'healthy' as const;
    if (autoSuite.overall === 'degraded') return 'degraded' as const;
    return 'critical' as const;
  }, [report, autoSuite]);

  const stampDisplay = report?.generatedAt ?? autoSuite?.generatedAt ?? null;

  const smokeSource = useMemo(() => {
    if (report?.smoke) return report.smoke;
    if (autoSuite) return { baseUrl: autoSuite.baseUrl, endpoints: autoSuite.smokeEndpoints };
    return null;
  }, [report, autoSuite]);

  function statusRowClass(status: AutomatedTestsPayload['results'][number]['status']): string {
    if (status === 'passed') return 'border-emerald-200 bg-emerald-50/80';
    if (status === 'failed') return 'border-red-200 bg-red-50/90';
    return 'border-stone-200 bg-stone-50/80';
  }

  const failedAutoCount = autoSuite?.results.filter((r) => r.status === 'failed').length ?? 0;

  return (
    <div className="space-y-5">
      <section className="rounded-xl bg-gradient-to-br from-[#2D1B1E] to-[#7B2D3F] p-5 text-white shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-5">
          <div className="text-3xl" aria-hidden>
            ⚡
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Диагностика проекта</h3>
            <p className="mt-1 text-sm text-white/80">
              Интеграционные автотесты (HTTP, БД, безопасность) плюс полный отчёт: метрики, скан проекта и AI-аудит.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="whitespace-nowrap rounded-lg border border-white/30 bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
              onClick={() => void runAutoTestsOnly()}
              disabled={autoLoading || isLoading}
            >
              {autoLoading ? 'Автотесты…' : 'Запустить автотесты'}
            </button>
            <button
              type="button"
              className="whitespace-nowrap rounded-lg border border-white/30 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
              onClick={() => void runFullAnalysis()}
              disabled={isLoading || autoLoading}
            >
              {isLoading ? 'Собираем отчёт…' : 'Полный отчёт'}
            </button>
          </div>
        </div>
        <div className="mt-3">
          <input
            className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/60 outline-none focus:border-white/40 focus:ring-2 focus:ring-white/20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Фокус аудита"
          />
        </div>
        {errorText ? (
          <p className="mt-3 rounded-lg border border-red-200/60 bg-red-50/90 px-3 py-2 text-sm text-red-800">
            {errorText}
          </p>
        ) : null}
      </section>

      {autoSuite ? (
        <section className="rounded-2xl border border-stone-200/90 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-extrabold text-[var(--text)]">Интеграционные автотесты</h4>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Серия проверок без браузера: публичные API, границы доступа, PostgreSQL, опционально — админ-маршруты с вашей
                сессией ({autoSuite.authenticatedContext ? 'контекст администратора подтверждён' : 'расширенные проверки пропущены — выполните вход'}).
              </p>
            </div>
            <div className="text-right">
              <p className={`text-2xl font-bold leading-none ${suiteOverallClass(autoSuite.overall)}`}>
                {autoSuite.overall === 'passed' ? 'OK' : autoSuite.overall === 'degraded' ? 'Внимание' : 'Ошибки'}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {autoSuite.summary.passed}/{autoSuite.summary.total} успешно · {autoSuite.durationMs} ms
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-stone-300 bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--text)] shadow-sm transition hover:bg-stone-50 disabled:opacity-50"
              disabled={aiAnalyzeLoading || autoLoading || failedAutoCount === 0}
              onClick={() => void runAiFailureAnalysis()}
              title={
                failedAutoCount === 0
                  ? 'Нет проваленных тестов для разбора'
                  : 'Отправить провалы в модель из настроек ИИ (Интеграции)'
              }
            >
              {aiAnalyzeLoading ? 'ИИ анализирует…' : 'Анализ ошибок ИИ'}
            </button>
            {failedAutoCount > 0 ? (
              <span className="text-xs text-[var(--text-secondary)]">
                Будут переданы {failedAutoCount} провалов (сообщения, HTTP-коды и фрагменты ответов сервера).
              </span>
            ) : (
              <span className="text-xs text-[var(--text-muted)]">ИИ-разбор доступен только при наличии проваленных тестов.</span>
            )}
          </div>
          <div className="mt-4 space-y-4">
            {Object.entries(suiteByCategory).map(([category, rows]) => (
              <div key={category}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">{category}</p>
                <div className="space-y-1.5">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-xl border px-3 py-2.5 text-sm ${statusRowClass(row.status)}`}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${tierBadgeClass(row.tier)}`}>
                          {row.tier}
                        </span>
                        <span className="min-w-0 flex-1 font-medium text-[var(--text)]">{row.name}</span>
                        {typeof row.httpStatus === 'number' ? (
                          <span className="shrink-0 rounded bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-800">
                            HTTP {row.httpStatus}
                          </span>
                        ) : null}
                        <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                          {row.status === 'passed' ? '✓' : row.status === 'failed' ? '✕' : '○'} {row.durationMs} ms
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-medium text-[var(--text)]">{row.message}</p>
                      {row.detail ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-stone-600">{row.detail}</p>
                      ) : null}
                      {row.responsePreview ? (
                        <div className="mt-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">Фрагмент ответа сервера</p>
                          <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-stone-200 bg-white/90 p-2 text-[11px] leading-snug text-stone-800">
                            {row.responsePreview}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {failureAnalysis ? (
            <div className="mt-6 rounded-xl border border-indigo-200/80 bg-indigo-50/40 p-4">
              <h5 className="text-sm font-extrabold text-indigo-950">Разбор ИИ (провайдер из интеграции)</h5>
              <p className="mt-1 text-xs text-indigo-900/80">{failureAnalysis.generatedAt}</p>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-indigo-950">{failureAnalysis.executiveSummary}</p>
              {failureAnalysis.errorHint ? (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950">
                  {failureAnalysis.errorHint}
                </p>
              ) : null}
              {failureAnalysis.items.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {failureAnalysis.items.map((item) => (
                    <article key={item.testId} className="rounded-lg border border-indigo-100 bg-white/90 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[var(--text)]">{item.testId}</span>
                        <span
                          className={
                            item.severity === 'blocking'
                              ? 'rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-800'
                              : item.severity === 'high'
                                ? 'rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-orange-900'
                                : 'rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-700'
                          }
                        >
                          {item.severity}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--text)]">{item.likelyRootCause}</p>
                      {item.evidence ? (
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">{item.evidence}</p>
                      ) : null}
                      {item.recommendedSteps.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-[var(--text-secondary)]">
                          {item.recommendedSteps.map((step, stepIdx) => (
                            <li key={`${item.testId}-${stepIdx}`}>{step}</li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-stone-400">Здоровье сервера</p>
          <p
            className={[
              'text-3xl font-bold leading-none',
              readinessDisplay === 'healthy'
                ? 'text-emerald-700'
                : readinessDisplay === 'critical'
                  ? 'text-red-600'
                : 'text-[var(--text)]',
            ].join(' ')}
          >
            {readinessDisplay ?? '—'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{stampDisplay ?? 'Нет данных'}</p>
        </article>
        <article className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-stone-400">CPU / RAM / DISK</p>
          <p className="text-3xl font-bold leading-none text-[var(--text)]">
            {Number(report?.server?.cpu?.usagePercent ?? 0).toFixed(1)}% / {Number(report?.server?.memory?.usagePercent ?? 0).toFixed(1)}% / {Number(report?.server?.disk?.usagePercent ?? 0).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">PID: {report?.server?.runtime?.pid ?? '—'}</p>
        </article>
        <article className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-stone-400">Здоровье проекта</p>
          <p className="text-3xl font-bold leading-none text-[var(--text)]">
            {report?.project?.filesScanned ?? 0} / {report?.project?.linesOfCode ?? 0}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Папок: {report?.project?.directoriesScanned ?? 0}</p>
        </article>
        <article className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-stone-400">Итоговый score</p>
          <p className={`text-3xl font-bold leading-none ${scoreClass(Number(report?.audit?.overallScore ?? 0))}`}>
            {Math.round(Number(report?.audit?.overallScore ?? 0))}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">0-100 (AI audit)</p>
        </article>
      </section>

      {!report && !autoSuite ? (
        <section className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-stone-200 bg-[var(--surface-elevated)] text-center">
          <div className="text-3xl" aria-hidden>
            📊
          </div>
          <p className="mt-3 max-w-md text-sm text-[var(--text-secondary)]">
            Запустите быстрые автотесты или полный отчёт — интеграционные проверки выполняются на сервере с теми же учётными данными,
            что и этот запрос.
          </p>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-5">
            <h4 className="text-sm font-extrabold text-[var(--text)]">Валидация релиза (gate)</h4>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={
                  report.releaseValidation.pass
                    ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700'
                    : 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700'
                }
              >
                {report.releaseValidation.pass ? '✓ Прошло' : '✕ Не прошло'}
              </span>
              <span className="text-sm text-[var(--text-secondary)]">
                {report.releaseValidation.pass ? 'Релиз можно пропускать' : 'Есть блокирующие проблемы'}
              </span>
            </div>
            {(report.releaseValidation.blockers ?? []).length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                {report.releaseValidation.blockers.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </section>

          <section className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-5">
            <h4 className="text-sm font-extrabold text-[var(--text)]">Сводка аудита</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{report.audit.summary}</p>
            {report.truthfulnessNote ? (
              <p className="mt-3 rounded-lg border border-stone-200 bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                {report.truthfulnessNote}
              </p>
            ) : null}
          </section>

          <section className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-5">
            <h4 className="text-sm font-extrabold text-[var(--text)]">Проблемы и рекомендации</h4>
            <div className="mt-3 space-y-1.5">
              {(report.audit.issues ?? []).length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">Проблем не обнаружено.</p>
              ) : (
                report.audit.issues.map((issue) => (
                  <article key={issue.id} className={`flex gap-2.5 rounded-lg px-3 py-2.5 ${severityClass(issue.severity)}`}>
                    <span className={`h-fit shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${severityBadgeClass(issue.severity)}`}>
                      {issue.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)]">{issue.title}</p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">{issue.description}</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Рекомендация: {issue.suggestion}</p>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
      {report || autoSuite ? (
      <>
      {report ? (
      <>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Топ файлов по размеру</h4>
          <div className="mt-3 space-y-2">
            {(report?.project?.topLargestFiles ?? []).slice(0, 10).map((file) => (
              <div key={file.path} className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                <div className="truncate font-semibold text-[var(--text)]">{file.path}</div>
                <div className="mt-1">
                  {(file.sizeBytes / 1024).toFixed(1)} KB · {file.lines} lines
                </div>
              </div>
            ))}
            {(report?.project?.topLargestFiles ?? []).length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Нет данных.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Технологический срез</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-3 text-sm text-[var(--text-secondary)]">
            <p>
              Зависимости: <strong>{report?.project?.packageDependenciesCount ?? 0}</strong> · DevDependencies:{' '}
              <strong>{report?.project?.packageDevDependenciesCount ?? 0}</strong>
            </p>
            <p className="mt-2">Node: {report?.server?.runtime?.nodeVersion ?? '—'}</p>
            <p>ENV: {report?.server?.runtime?.env ?? '—'}</p>
            <p>Uptime: {Math.round(Number(report?.server?.runtime?.processUptimeSec ?? 0))}s</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(report?.project?.byExtension ?? {})
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([ext, count]) => (
                <span
                  key={ext}
                  className="rounded-full border border-stone-200 bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {ext}: {count}
                </span>
              ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Скорость проверки</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-3 text-sm text-[var(--text-secondary)]">
            <p>DB health check: {report?.performance?.healthCheckMs ?? 0} ms</p>
            <p>Server metrics: {report?.performance?.serverCheckMs ?? 0} ms</p>
            <p>Project scan: {report?.performance?.scanCheckMs ?? 0} ms</p>
            <p>Event loop lag: {report?.performance?.eventLoopLagMs ?? 0} ms</p>
            <p>HTTP duration p95: {report?.performance?.httpDurationP95Ms ?? 0} ms</p>
          </div>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Анализ журнала</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-3 text-sm text-[var(--text-secondary)]">
            <p>Всего логов: {report?.journal?.total ?? 0}</p>
            <p>
              info/warn/error: {report?.journal?.byLevel?.info ?? 0}/{report?.journal?.byLevel?.warn ?? 0}/
              {report?.journal?.byLevel?.error ?? 0}
            </p>
          </div>
          <div className="mt-3 space-y-1">
            {(report?.journal?.topEvents ?? []).slice(0, 6).map((ev) => (
              <div key={ev.event} className="rounded-lg border border-stone-200 bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
                {ev.event}: {ev.count}
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1">
            {(report?.journal?.recentErrors ?? []).slice(0, 4).map((err, idx) => (
              <div key={`${err.created_at}-${idx}`} className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-900">
                [{err.scope}] {err.message}
              </div>
            ))}
          </div>
        </article>
      </section>
      </>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Smoke API</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{smokeSource?.baseUrl ?? '—'}</p>
          <div className="mt-3 space-y-1.5">
            {(smokeSource?.endpoints ?? []).map((item) => (
              <div key={item.path} className="rounded-lg border border-stone-200 bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                {item.path}: {item.status || 'ERR'} · {item.durationMs} ms · {item.ok ? 'OK' : 'FAIL'}
                {item.note ? <div className="text-xs text-[var(--text-secondary)]">{item.note}</div> : null}
              </div>
            ))}
          </div>
        </article>
        {report ? (
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Интеграции</h4>
          <div className="mt-3 space-y-2 text-sm">
            <div className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-3">
              <p className="font-semibold text-[var(--text)]">Redis</p>
              <p className="text-[var(--text-secondary)]">
                configured: {String(report?.integrations?.redis?.configured ?? false)} · reachable:{' '}
                {String(report?.integrations?.redis?.reachable ?? false)}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{report?.integrations?.redis?.details ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-[var(--surface-elevated)] p-3">
              <p className="font-semibold text-[var(--text)]">Supabase</p>
              <p className="text-[var(--text-secondary)]">
                configured: {String(report?.integrations?.supabase?.configured ?? false)} · reachable:{' '}
                {String(report?.integrations?.supabase?.reachable ?? false)}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{report?.integrations?.supabase?.details ?? '—'}</p>
            </div>
          </div>
        </article>
        ) : (
        <article className="rounded-2xl border border-dashed border-stone-200 bg-[var(--surface-elevated)] p-5 text-sm text-[var(--text-secondary)] shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Интеграции</h4>
          <p className="mt-2">Доступно в полном отчёте.</p>
        </article>
        )}
        {report ? (
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Критичные ENV</h4>
          <div className="mt-3 flex flex-wrap gap-2">
            {(report?.environment?.criticalEnv ?? []).map((item) => (
              <span
                key={item.key}
                className={
                  item.present
                    ? 'rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900'
                    : 'rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-900'
                }
              >
                {item.key}: {item.present ? 'ok' : 'missing'}
              </span>
            ))}
          </div>
          {(report?.environment?.missingCritical ?? []).length > 0 ? (
            <p className="mt-3 text-xs text-red-700">Отсутствуют: {report?.environment?.missingCritical.join(', ')}</p>
          ) : (
            <p className="mt-3 text-xs text-emerald-700">Все критичные переменные присутствуют.</p>
          )}
        </article>
        ) : (
        <article className="rounded-2xl border border-dashed border-stone-200 bg-[var(--surface-elevated)] p-5 text-sm text-[var(--text-secondary)] shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Критичные ENV</h4>
          <p className="mt-2">Доступно в полном отчёте.</p>
        </article>
        )}
      </section>

      {report ? (
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-[var(--text)]">Регрессии относительно прошлого запуска</h4>
        {report.regression.hasRegression ? (
          <div className="mt-2">
            <p className="text-sm font-semibold text-red-700">Обнаружены регрессии</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-800">
              {report.regression.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm font-semibold text-emerald-700">Регрессий не найдено</p>
        )}
        {report?.regression?.previous ? (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Бейзлайн: {report.regression.previous.generatedAt}, p95 {report.regression.previous.httpDurationP95Ms} ms, error rate {(report.regression.previous.errorRate * 100).toFixed(1)}%
          </p>
        ) : (
          <p className="mt-2 text-xs text-[var(--text-secondary)]">Это первый запуск — бейзлайн только что создан.</p>
        )}
      </section>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
