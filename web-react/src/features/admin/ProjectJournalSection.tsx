import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { fetchAppLogsAdmin, type AppLogItem } from './api';

const Q_JOURNAL = ['admin', 'journal', 'logs'] as const;

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
