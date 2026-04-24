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
  if (severity === 'CRITICAL') return 'border-red-300 bg-red-50 text-red-900';
  if (severity === 'HIGH') return 'border-orange-300 bg-orange-50 text-orange-900';
  if (severity === 'MEDIUM') return 'border-amber-300 bg-amber-50 text-amber-900';
  return 'border-emerald-300 bg-emerald-50 text-emerald-900';
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
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="text-base font-extrabold text-stone-900">Полная диагностика проекта</h3>
        <p className="mt-2 text-sm text-stone-600">
          Нажмите кнопку ниже: система соберет health, server metrics, project scan и AI-аудит, затем
          покажет сводное состояние проекта в одном дашборде.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Фокус аудита"
          />
          <button
            type="button"
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-60"
            onClick={() => void runFullAnalysis()}
            disabled={isLoading}
          >
            {isLoading ? 'Проверяем и анализируем…' : 'Проверить проект и собрать честный отчет'}
          </button>
        </div>
        {errorText ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errorText}
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Здоровье сервера</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">{report?.readiness?.overall ?? '—'}</p>
          <p className="mt-1 text-xs text-stone-500">{report?.generatedAt ?? '—'}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">CPU / RAM / Disk</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">
            {Number(report?.server?.cpu?.usagePercent ?? 0).toFixed(1)}% / {Number(report?.server?.memory?.usagePercent ?? 0).toFixed(1)}% / {Number(report?.server?.disk?.usagePercent ?? 0).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-stone-500">PID: {report?.server?.runtime?.pid ?? '—'}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Здоровье проекта</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">
            {report?.project?.filesScanned ?? 0} / {report?.project?.linesOfCode ?? 0}
          </p>
          <p className="mt-1 text-xs text-stone-500">Папок: {report?.project?.directoriesScanned ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Итоговый score</p>
          <p className={`mt-2 text-2xl font-extrabold ${scoreClass(Number(report?.audit?.overallScore ?? 0))}`}>
            {Math.round(Number(report?.audit?.overallScore ?? 0))}
          </p>
          <p className="mt-1 text-xs text-stone-500">0-100 (AI audit)</p>
        </article>
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Валидация релиза (gate)</h4>
        <p
          className={
            report?.releaseValidation?.pass
              ? 'mt-2 text-sm font-bold text-emerald-700'
              : 'mt-2 text-sm font-bold text-red-700'
          }
        >
          {report ? (report.releaseValidation.pass ? 'PASS: релиз можно пропускать' : 'FAIL: релиз блокирован') : '—'}
        </p>
        {(report?.releaseValidation?.blockers ?? []).length > 0 ? (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-800">
            {report?.releaseValidation?.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Проверки перед анализом (факты)</h4>
        <div className="mt-3 space-y-2">
          {(report?.readiness?.checks ?? []).length === 0 ? (
            <p className="text-sm text-stone-500">Пока нет проверок.</p>
          ) : (
            report?.readiness?.checks.map((check) => (
              <div key={check.name} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-sm text-stone-900">{check.name}</strong>
                  <span
                    className={
                      check.status === 'passed'
                        ? 'rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900'
                        : check.status === 'warning'
                          ? 'rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900'
                          : 'rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-900'
                    }
                  >
                    {check.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-stone-700">{check.details}</p>
                <p className="mt-1 text-xs text-stone-500">Время: {check.durationMs} ms</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Сводка аудита</h4>
        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{report?.audit?.summary ?? 'Запустите анализ, чтобы получить сводку.'}</p>
        {report?.truthfulnessNote ? (
          <p className="mt-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
            {report.truthfulnessNote}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Проблемы и рекомендации</h4>
        <div className="mt-3 space-y-2">
          {(report?.audit?.issues ?? []).length === 0 ? (
            <p className="text-sm text-stone-500">После анализа здесь появится список проблем.</p>
          ) : (
            (report?.audit?.issues ?? []).map((issue) => (
              <article key={issue.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-stone-900">{issue.title}</strong>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${severityClass(issue.severity)}`}>
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-stone-700">{issue.description}</p>
                <p className="mt-1 text-xs text-stone-600">Рекомендация: {issue.suggestion}</p>
              </article>
            ))
          )}
        </div>
        {(report?.audit?.recommendations ?? []).length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {report?.audit?.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Топ файлов по размеру</h4>
          <div className="mt-3 space-y-2">
            {(report?.project?.topLargestFiles ?? []).slice(0, 10).map((file) => (
              <div key={file.path} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700">
                <div className="truncate font-semibold text-stone-900">{file.path}</div>
                <div className="mt-1">
                  {(file.sizeBytes / 1024).toFixed(1)} KB · {file.lines} lines
                </div>
              </div>
            ))}
            {(report?.project?.topLargestFiles ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">Нет данных.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Технологический срез</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
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
                  className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700"
                >
                  {ext}: {count}
                </span>
              ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Скорость проверки</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
            <p>DB health check: {report?.performance?.healthCheckMs ?? 0} ms</p>
            <p>Server metrics: {report?.performance?.serverCheckMs ?? 0} ms</p>
            <p>Project scan: {report?.performance?.scanCheckMs ?? 0} ms</p>
            <p>Event loop lag: {report?.performance?.eventLoopLagMs ?? 0} ms</p>
            <p>HTTP duration p95: {report?.performance?.httpDurationP95Ms ?? 0} ms</p>
          </div>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Анализ журнала</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
            <p>Всего логов: {report?.journal?.total ?? 0}</p>
            <p>
              info/warn/error: {report?.journal?.byLevel?.info ?? 0}/{report?.journal?.byLevel?.warn ?? 0}/
              {report?.journal?.byLevel?.error ?? 0}
            </p>
          </div>
          <div className="mt-3 space-y-1">
            {(report?.journal?.topEvents ?? []).slice(0, 6).map((ev) => (
              <div key={ev.event} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700">
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
          <h4 className="text-sm font-extrabold text-stone-900">Smoke API</h4>
          <p className="mt-1 text-xs text-stone-500">{report?.smoke?.baseUrl ?? '—'}</p>
          <div className="mt-3 space-y-1.5">
            {(report?.smoke?.endpoints ?? []).map((item) => (
              <div key={item.path} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-800">
                {item.path}: {item.status || 'ERR'} · {item.durationMs} ms · {item.ok ? 'OK' : 'FAIL'}
                {item.note ? <div className="text-[10px] text-stone-500">{item.note}</div> : null}
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Интеграции</h4>
          <div className="mt-3 space-y-2 text-sm">
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="font-semibold text-stone-900">Redis</p>
              <p className="text-stone-700">
                configured: {String(report?.integrations?.redis?.configured ?? false)} · reachable:{' '}
                {String(report?.integrations?.redis?.reachable ?? false)}
              </p>
              <p className="text-xs text-stone-600">{report?.integrations?.redis?.details ?? '—'}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="font-semibold text-stone-900">Supabase</p>
              <p className="text-stone-700">
                configured: {String(report?.integrations?.supabase?.configured ?? false)} · reachable:{' '}
                {String(report?.integrations?.supabase?.reachable ?? false)}
              </p>
              <p className="text-xs text-stone-600">{report?.integrations?.supabase?.details ?? '—'}</p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Критичные ENV</h4>
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
        <h4 className="text-sm font-extrabold text-stone-900">Регрессии относительно прошлого запуска</h4>
        {!report ? (
          <p className="mt-2 text-sm text-stone-500">Нет данных.</p>
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
          <p className="mt-2 text-xs text-stone-600">
            Бейзлайн: {report.regression.previous.generatedAt}, p95 {report.regression.previous.httpDurationP95Ms} ms, error rate {(report.regression.previous.errorRate * 100).toFixed(1)}%
          </p>
        ) : (
          <p className="mt-2 text-xs text-stone-500">Это первый запуск — бейзлайн только что создан.</p>
        )}
      </section>
    </div>
  );
}
