import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { fetchAppLogsAdmin, type AppLogItem } from './api';

const Q_JOURNAL = ['admin', 'journal', 'logs'] as const;
const SLOW_MS = 1200;

function badgeClass(level: AppLogItem['level']): string {
  if (level === 'error') return 'bg-red-100 text-red-700 border-red-200';
  if (level === 'warn') return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

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
        <h3 className="text-base font-bold text-stone-900">Журнал проекта</h3>
        <p className="mt-1 text-sm text-stone-600">
          Здесь отображаются серверные процессы, запросы и ошибки. Обновляется автоматически.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            Норма: {stats.info}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
            Предупреждения: {stats.warn}
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-red-700">
            Ошибки: {stats.error}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as typeof level)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          >
            <option value="all">Все уровни</option>
            <option value="info">Только норма</option>
            <option value="warn">Только предупреждения</option>
            <option value="error">Только ошибки</option>
          </select>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearch(searchInput.trim());
            }}
            placeholder="Поиск: раздел, действие, текст ошибки..."
            className="min-w-[220px] flex-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
          />
          <button
            type="button"
            onClick={() => setSearch(searchInput.trim())}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
          >
            Применить
          </button>
          <button
            type="button"
            onClick={() => q.refetch()}
            className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
          >
            Обновить
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-bold text-stone-900">Умный анализ сервиса</h4>
          <p className="mt-1 text-sm text-stone-600">
            Автоматическая оценка показывает, как сейчас работает система и где есть риски.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Здоровье сервиса</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{analysis.healthScore}/100</p>
              <p className="text-xs text-stone-600">{analysis.healthText}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Ошибки 5xx</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{pct(analysis.errorRate)}</p>
              <p className="text-xs text-stone-600">от API-запросов</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Средний ответ API</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">
                {analysis.avgDuration == null ? '—' : `${Math.round(analysis.avgDuration)} мс`}
              </p>
              <p className="text-xs text-stone-600">медленные: {analysis.slowCount}</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">Записей в анализе</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{analysis.total}</p>
              <p className="text-xs text-stone-600">API-запросов: {analysis.totalHttp}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {analysis.insights.map((line) => (
              <p key={line} className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                {line}
              </p>
            ))}
          </div>
        </div>
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
              <li key={it.id} className="space-y-2 p-4">
                {(() => {
                  const hint = actionHint(it);
                  return (
                    <>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border px-2 py-0.5 font-bold uppercase ${badgeClass(it.level)}`}>
                    {levelLabel(it.level)}
                  </span>
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">
                    {scopeLabel(it.scope)}
                  </span>
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">
                    {it.event}
                  </span>
                  <span className="text-stone-500">{prettyDate(it.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-stone-900">{it.message}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
                  {it.request_method && it.request_path && (
                    <span>
                      {it.request_method} {it.request_path}
                    </span>
                  )}
                  {typeof it.status_code === 'number' && <span>Код ответа: {it.status_code}</span>}
                  {typeof it.duration_ms === 'number' && <span>Время ответа: {it.duration_ms} мс</span>}
                  {typeof it.user_id === 'number' && <span>Пользователь: #{it.user_id}</span>}
                  {it.ip && <span>IP: {it.ip}</span>}
                </div>
                {hint && (
                  <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900">
                    Что проверить: {hint}
                  </p>
                )}
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
