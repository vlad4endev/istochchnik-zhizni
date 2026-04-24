import { useState } from 'react';
import { apiClient } from '../../lib/apiClient';

type HealthPayload = {
  status: string;
  timestamp: string;
  version: string;
};

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
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [server, setServer] = useState<ServerPayload | null>(null);
  const [scan, setScan] = useState<ScanPayload | null>(null);
  const [audit, setAudit] = useState<AuditPayload | null>(null);
  const [description, setDescription] = useState('Полный аудит состояния проекта и инфраструктуры');

  async function runFullAnalysis(): Promise<void> {
    setIsLoading(true);
    setErrorText(null);
    try {
      const [healthRes, serverRes, scanRes, auditRes] = await Promise.all([
        apiClient.get<HealthPayload>('/api/diagnostics/health'),
        apiClient.get<ServerPayload>('/api/diagnostics/server'),
        apiClient.get<ScanPayload>('/api/diagnostics/scan'),
        apiClient.post<AuditPayload>('/api/diagnostics/audit', { description }),
      ]);
      setHealth(healthRes.data);
      setServer(serverRes.data);
      setScan(scanRes.data);
      setAudit(auditRes.data);
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
            {isLoading ? 'Анализируем…' : 'Запустить полный анализ'}
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
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Health</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">{health?.status ?? '—'}</p>
          <p className="mt-1 text-xs text-stone-500">v{health?.version ?? '—'}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">CPU / RAM / Disk</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">
            {Number(server?.cpu?.usagePercent ?? 0).toFixed(1)}% / {Number(server?.memory?.usagePercent ?? 0).toFixed(1)}% / {Number(server?.disk?.usagePercent ?? 0).toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-stone-500">PID: {server?.runtime?.pid ?? '—'}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Файлы / LOC</p>
          <p className="mt-2 text-lg font-extrabold text-stone-900">
            {scan?.filesScanned ?? 0} / {scan?.linesOfCode ?? 0}
          </p>
          <p className="mt-1 text-xs text-stone-500">Папок: {scan?.directoriesScanned ?? 0}</p>
        </article>
        <article className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Итоговый score</p>
          <p className={`mt-2 text-2xl font-extrabold ${scoreClass(Number(audit?.overallScore ?? 0))}`}>
            {Math.round(Number(audit?.overallScore ?? 0))}
          </p>
          <p className="mt-1 text-xs text-stone-500">0-100 (AI audit)</p>
        </article>
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Сводка аудита</h4>
        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{audit?.summary ?? 'Запустите анализ, чтобы получить сводку.'}</p>
      </section>

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h4 className="text-sm font-extrabold text-stone-900">Проблемы и рекомендации</h4>
        <div className="mt-3 space-y-2">
          {(audit?.issues ?? []).length === 0 ? (
            <p className="text-sm text-stone-500">После анализа здесь появится список проблем.</p>
          ) : (
            (audit?.issues ?? []).map((issue) => (
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
        {(audit?.recommendations ?? []).length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
            {audit?.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Топ файлов по размеру</h4>
          <div className="mt-3 space-y-2">
            {(scan?.topLargestFiles ?? []).slice(0, 10).map((file) => (
              <div key={file.path} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700">
                <div className="truncate font-semibold text-stone-900">{file.path}</div>
                <div className="mt-1">
                  {(file.sizeBytes / 1024).toFixed(1)} KB · {file.lines} lines
                </div>
              </div>
            ))}
            {(scan?.topLargestFiles ?? []).length === 0 ? (
              <p className="text-sm text-stone-500">Нет данных.</p>
            ) : null}
          </div>
        </article>

        <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
          <h4 className="text-sm font-extrabold text-stone-900">Технологический срез</h4>
          <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700">
            <p>
              Зависимости: <strong>{scan?.packageDependenciesCount ?? 0}</strong> · DevDependencies:{' '}
              <strong>{scan?.packageDevDependenciesCount ?? 0}</strong>
            </p>
            <p className="mt-2">Node: {server?.runtime?.nodeVersion ?? '—'}</p>
            <p>ENV: {server?.runtime?.env ?? '—'}</p>
            <p>Uptime: {Math.round(Number(server?.runtime?.processUptimeSec ?? 0))}s</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(scan?.byExtension ?? {})
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
    </div>
  );
}
