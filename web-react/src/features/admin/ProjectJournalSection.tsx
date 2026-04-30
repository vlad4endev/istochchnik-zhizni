import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { fetchAppLogsAdmin, type AppLogItem } from './api';

const Q_JOURNAL = ['admin', 'journal', 'logs'] as const;
const SLOW_MS = 1200;

function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

function levelLabel(level: AppLogItem['level']): string {
  if (level === 'error') return 'Ошибка';
  if (level === 'warn') return 'Предупреждение';
  return 'Норма';
}

function scopeLabel(scope: string): string {
  if (scope === 'http') return 'Запросы API';
  if (scope === 'boot') return 'Запуск сервера';
  if (scope === 'runtime') return 'Работа сервера';
  return scope;
}

function actionHint(it: AppLogItem): string | null {
  if (it.scope === 'http' && typeof it.status_code === 'number') {
    const s = it.status_code;
    if (s === 400) return 'Проверьте заполнение полей формы: в запросе есть некорректные данные.';
    if (s === 401) return 'Проверьте, выполнен ли вход в систему, и не истекла ли сессия.';
    if (s === 403) return 'У пользователя нет нужных прав. Проверьте роль и доступ к разделу.';
    if (s === 404) return 'Объект не найден. Проверьте, существует ли запись и правильный ли раздел открыт.';
    if (s === 409) return 'Конфликт данных. Проверьте, не дублируется ли запись или действие.';
    if (s === 422) return 'Данные не прошли проверку. Проверьте формат и обязательные поля.';
    if (s === 429) return 'Слишком много запросов. Подождите и повторите действие чуть позже.';
    if (s >= 500) return 'Сбой на сервере. Проверьте состояние БД, подключение к сервисам и последние ошибки.';
    if (s >= 400) return 'Проверьте входные данные, права доступа и корректность действия.';
    return null;
  }

  if (it.scope === 'boot' && it.level === 'error') {
    return 'Сервер не запустился. Проверьте переменные окружения, БД и последние изменения.';
  }

  if (it.scope === 'runtime' && it.level === 'error') {
    return 'Критическая ошибка в работе сервера. Проверьте стек ошибки и повторяющиеся сбои.';
  }

  if (it.level === 'warn') {
    return 'Есть предупреждение. Проверьте запрос, данные и права пользователя.';
  }

  return null;
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

type JournalAnalysis = {
  total: number;
  totalHttp: number;
  errorCount: number;
  warnCount: number;
  errorRate: number;
  avgDuration: number | null;
  slowCount: number;
  healthScore: number;
  healthText: string;
  topErrorPath: { path: string; count: number } | null;
  topSlowPath: { path: string; avgMs: number } | null;
  insights: string[];
};

function analyzeLogs(items: AppLogItem[]): JournalAnalysis {
  const http = items.filter((it) => it.scope === 'http');
  const errorCount = items.filter((it) => it.level === 'error').length;
  const warnCount = items.filter((it) => it.level === 'warn').length;
  const totalHttp = http.length;
  const errorRate = totalHttp > 0 ? (http.filter((it) => (it.status_code ?? 0) >= 500).length / totalHttp) * 100 : 0;

  const durations = http
    .map((it) => (typeof it.duration_ms === 'number' ? it.duration_ms : null))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgDuration = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : null;
  const slowCount = durations.filter((d) => d >= SLOW_MS).length;

  const errorPathMap = new Map<string, number>();
  for (const it of http) {
    if ((it.status_code ?? 0) >= 500 && it.request_path) {
      errorPathMap.set(it.request_path, (errorPathMap.get(it.request_path) ?? 0) + 1);
    }
  }
  let topErrorPath: { path: string; count: number } | null = null;
  for (const [path, count] of errorPathMap) {
    if (!topErrorPath || count > topErrorPath.count) topErrorPath = { path, count };
  }

  const slowPathMap = new Map<string, { total: number; count: number }>();
  for (const it of http) {
    if (typeof it.duration_ms === 'number' && it.request_path) {
      const prev = slowPathMap.get(it.request_path) ?? { total: 0, count: 0 };
      prev.total += it.duration_ms;
      prev.count += 1;
      slowPathMap.set(it.request_path, prev);
    }
  }
  let topSlowPath: { path: string; avgMs: number } | null = null;
  for (const [path, v] of slowPathMap) {
    const avg = v.total / v.count;
    if (!topSlowPath || avg > topSlowPath.avgMs) topSlowPath = { path, avgMs: avg };
  }

  let healthScore = 100;
  healthScore -= Math.min(40, errorRate * 6);
  if (avgDuration != null) healthScore -= Math.min(25, avgDuration / 120);
  if (slowCount > 0) healthScore -= Math.min(20, slowCount * 2);
  if (items.some((it) => it.scope === 'runtime' && it.level === 'error')) healthScore -= 15;
  if (items.some((it) => it.scope === 'boot' && it.level === 'error')) healthScore -= 10;
  healthScore = Math.max(0, Math.round(healthScore));

  let healthText = 'Стабильно';
  if (healthScore < 40) healthText = 'Критично';
  else if (healthScore < 65) healthText = 'Нестабильно';
  else if (healthScore < 85) healthText = 'Есть риски';

  const insights: string[] = [];
  if (totalHttp === 0) {
    insights.push('Пока мало данных по запросам API. Оценка появится после работы пользователей.');
  } else {
    insights.push(`Сервер обработал ${totalHttp} API-запросов в текущей выборке.`);
    if (errorRate >= 5) {
      insights.push(`Высокая доля ошибок 5xx: ${pct(errorRate)}. Это признак серверного сбоя.`);
    } else if (errorRate > 0) {
      insights.push(`Ошибки 5xx есть, но пока в умеренном объеме: ${pct(errorRate)}.`);
    } else {
      insights.push('Ошибок 5xx не обнаружено: сервер отвечает стабильно.');
    }
    if (avgDuration != null) {
      if (avgDuration >= SLOW_MS) insights.push('Средний ответ API медленный — стоит проверить БД и тяжелые запросы.');
      else insights.push(`Среднее время ответа API: ${Math.round(avgDuration)} мс.`);
    }
    if (topErrorPath) insights.push(`Чаще всего падает endpoint ${topErrorPath.path} (${topErrorPath.count} раз).`);
    if (topSlowPath && topSlowPath.avgMs >= SLOW_MS) {
      insights.push(`Самый тяжелый endpoint: ${topSlowPath.path} (в среднем ${Math.round(topSlowPath.avgMs)} мс).`);
    }
  }

  return {
    total: items.length,
    totalHttp,
    errorCount,
    warnCount,
    errorRate,
    avgDuration,
    slowCount,
    healthScore,
    healthText,
    topErrorPath,
    topSlowPath,
    insights,
  };
}

export function ProjectJournalSection() {
  const [level, setLevel] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: [...Q_JOURNAL, level, search],
    queryFn: () =>
      fetchAppLogsAdmin({
        level: level === 'all' ? undefined : level,
        search,
        limit: 150,
      }),
    refetchInterval: 15000,
  });

  const items = q.data ?? [];
  const stats = useMemo(() => {
    const s = { info: 0, warn: 0, error: 0 };
    for (const it of items) s[it.level] += 1;
    return s;
  }, [items]);
  const analysis = useMemo(() => analyzeLogs(items), [items]);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-[14px] bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
              ✓ Норма: {stats.info}
            </span>
            <span className="rounded-[14px] bg-yellow-100 px-3 py-1 text-xs font-medium text-amber-700">
              ⚠ Предупреждения: {stats.warn}
            </span>
            <span className="rounded-[14px] bg-red-100 px-3 py-1 text-xs font-medium text-red-600">
              ✕ Ошибки: {stats.error}
            </span>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Все уровни</option>
            <option value="info">Норма</option>
            <option value="warn">Предупреждение</option>
            <option value="error">Ошибка</option>
          </select>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearch(searchInput.trim());
            }}
            placeholder="Поиск по разделу, действию, тексту..."
            className="min-w-[260px] flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          />
          <button
            type="button"
            onClick={() => setSearch(searchInput.trim())}
            className="rounded-lg bg-stone-100 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-200"
          >
            Применить
          </button>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="rounded-lg bg-[#7B2D3F] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          >
            ↺ Обновить
          </button>
        </div>
      </div>
      </div>

      {items.length > 0 && (
        <details className="rounded-[10px] border border-stone-200 bg-stone-50 p-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-stone-700">
            Умный анализ сервиса — Здоровье: {analysis.healthScore}/100 ✓
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-500">Здоровье сервиса</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{analysis.healthScore}/100</p>
              <p className="text-xs text-stone-600">{analysis.healthText}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-500">Ошибки 5xx</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{pct(analysis.errorRate)}</p>
              <p className="text-xs text-stone-600">от API-запросов</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-500">Средний ответ API</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">
                {analysis.avgDuration == null ? '—' : `${Math.round(analysis.avgDuration)} мс`}
              </p>
              <p className="text-xs text-stone-600">медленные: {analysis.slowCount}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <p className="text-xs font-semibold text-stone-500">Записей в анализе</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{analysis.total}</p>
              <p className="text-xs text-stone-600">API-запросов: {analysis.totalHttp}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {analysis.insights.map((line) => (
              <p key={line} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
                {line}
              </p>
            ))}
          </div>
        </details>
      )}

      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        {q.isLoading ? (
          <div className="p-5 text-sm text-stone-500">Загружаю журнал...</div>
        ) : q.isError ? (
          <div className="p-5 text-sm text-red-700">Не удалось загрузить журнал.</div>
        ) : items.length === 0 ? (
          <div className="p-5 text-sm text-stone-500">Логов пока нет.</div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {items.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId((prev) => (prev === it.id ? null : it.id))}
                  className={[
                    'grid w-full grid-cols-[80px_180px_1fr_140px] items-center gap-3 border-l-[3px] px-3.5 py-2.5 text-left hover:bg-stone-50',
                    it.level === 'error'
                      ? 'border-l-red-500 bg-red-50/50'
                      : it.level === 'warn'
                        ? 'border-l-amber-500 bg-amber-50/50'
                        : 'border-l-emerald-500',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'rounded px-1.5 py-0.5 text-center text-[10px] font-bold tracking-[0.5px]',
                      it.level === 'error'
                        ? 'bg-red-100 text-red-600'
                        : it.level === 'warn'
                          ? 'bg-yellow-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700',
                    ].join(' ')}
                  >
                    {levelLabel(it.level).toUpperCase()}
                  </span>
                  <span className="text-xs text-stone-500">
                    {scopeLabel(it.scope)} · {it.event}
                  </span>
                  <span className="truncate text-sm font-medium text-stone-900">{it.message}</span>
                  <span className="text-right text-[11px] text-stone-400">{prettyDate(it.created_at)}</span>
                </button>
                <div className={expandedId === it.id ? 'block border-b border-stone-100 px-7 pb-2.5 text-xs text-stone-500' : 'hidden'}>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {it.request_method && it.request_path && (
                      <span>
                        {it.request_method} {it.request_path}
                      </span>
                    )}
                    {typeof it.status_code === 'number' && <span>Код ответа: {it.status_code}</span>}
                    {typeof it.duration_ms === 'number' && <span>Время: {it.duration_ms} мс</span>}
                    {it.ip && <span>IP: {it.ip}</span>}
                    {typeof it.user_id === 'number' && <span>Пользователь: #{it.user_id}</span>}
                    {actionHint(it) ? <span>· Что проверить: {actionHint(it)}</span> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
