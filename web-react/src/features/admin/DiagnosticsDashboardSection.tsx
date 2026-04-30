import { useState } from 'react';
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

type FullReportPayload = {
  generatedAt: string;
  readiness: {
    overall: 'healthy' | 'degraded' | 'critical';
    checks: Array<{ name: string; status: 'passed' | 'warning' | 'failed'; details: string; durationMs: number }>;
  };
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

export function DiagnosticsDashboardSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [report, setReport] = useState<FullReportPayload | null>(null);
  const [description, setDescription] = useState('Полный аудит состояния проекта и инфраструктуры');

  async function runFullAnalysis(): Promise<void> {
    setIsLoading(true);
    setErrorText(null);
    try {
      const full = await apiClient.post<FullReportPayload>('/api/diagnostics/full-report', { description });
      setReport(full.data);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Не удалось выполнить диагностику');
    } finally {
      setIsLoading(false);
    }
  }

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
              Собирает health, метрики сервера, сканирование структуры и AI-аудит в одном месте.
            </p>
          </div>
          <button
            type="button"
            className="whitespace-nowrap rounded-lg border border-white/30 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-60"
            onClick={() => void runFullAnalysis()}
            disabled={isLoading}
          >
            {isLoading ? 'Собираем отчёт…' : 'Проверить и собрать отчёт'}
          </button>
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

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.5px] text-stone-400">Здоровье сервера</p>
          <p
            className={[
              'text-3xl font-bold leading-none',
              report?.readiness?.overall === 'healthy'
                ? 'text-emerald-700'
                : report?.readiness?.overall === 'critical'
                  ? 'text-red-600'
                : 'text-[var(--text)]',
            ].join(' ')}
          >
            {report?.readiness?.overall ?? '—'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{report?.generatedAt ?? 'Нет данных'}</p>
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

      {!report ? (
        <section className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-stone-200 bg-[var(--surface-elevated)] text-center">
          <div className="text-3xl" aria-hidden>
            📊
          </div>
          <p className="mt-3 text-sm text-[var(--text-secondary)]">Нажмите «Проверить и собрать отчёт» чтобы получить полный анализ</p>
        </section>
      ) : (
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
      )}
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

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-[var(--text)]">Smoke API</h4>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{report?.smoke?.baseUrl ?? '—'}</p>
          <div className="mt-3 space-y-1.5">
            {(report?.smoke?.endpoints ?? []).map((item) => (
              <div key={item.path} className="rounded-lg border border-stone-200 bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)]">
                {item.path}: {item.status || 'ERR'} · {item.durationMs} ms · {item.ok ? 'OK' : 'FAIL'}
                {item.note ? <div className="text-xs text-[var(--text-secondary)]">{item.note}</div> : null}
              </div>
            ))}
          </div>
        </article>
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
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-[var(--text)]">Регрессии относительно прошлого запуска</h4>
        {!report ? (
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Нет данных.</p>
        ) : report.regression.hasRegression ? (
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
      </>
      ) : null}
    </div>
  );
}
