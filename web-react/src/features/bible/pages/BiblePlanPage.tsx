import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LuArrowRight,
  LuBookOpen,
  LuCheck,
  LuChevronLeft,
  LuSparkles,
  LuTrash2,
} from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import {
  completeBiblePlanDay,
  deleteBiblePlan,
  fetchBiblePlan,
  fetchBiblePlans,
  generateBiblePlan,
  type BiblePlan,
  type BiblePlanDay,
  type BiblePlanRef,
} from '../api';
import { biblePlanRefUrl, formatBiblePlanRef } from '../bibleRef';
import { readStoredTranslation } from '../bibleUiMeta';

function planProgress(plan: BiblePlan): { done: number; total: number; pct: number } {
  const days = plan.days;
  const total =
    days?.length ??
    (typeof plan.days_total === 'number' ? plan.days_total : 0);
  const done =
    days?.filter((d) => Boolean(d.completed_at)).length ??
    (typeof plan.days_completed === 'number' ? plan.days_completed : 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

function ProgressBar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <div
      className={`h-1.5 overflow-hidden rounded-full bg-stone-200/80 ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function nextUnreadDay(days: BiblePlanDay[]): BiblePlanDay | null {
  return days.find((d) => !d.completed_at) ?? null;
}

function firstRef(day: BiblePlanDay): BiblePlanRef | null {
  return day.refs_json?.[0] ?? null;
}

export function BiblePlansListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [goal, setGoal] = useState('Евангелия за 30 дней');
  const [days, setDays] = useState(30);
  const [createOpen, setCreateOpen] = useState(false);

  const plansQ = useQuery({
    queryKey: ['bible', 'plans'],
    queryFn: fetchBiblePlans,
  });

  const genMut = useMutation({
    mutationFn: () => generateBiblePlan({ goal, days }),
    onSuccess: (plan) => {
      void qc.invalidateQueries({ queryKey: ['bible', 'plans'] });
      void navigate(`/bible/plans/${plan.id}`);
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? '')
          : '';
      emitAppToast(msg || 'Не удалось создать план (проверьте ИИ в админке)', 'error');
    },
  });

  const plans = plansQ.data ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4">
        <Link
          to="/bible"
          className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-stone-500 transition hover:text-primary"
        >
          <LuChevronLeft size={16} /> К Библии
        </Link>

        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Планы чтения
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-stone-500">
            День за днём — откройте отрывок и отметьте прочитанное.
          </p>
        </header>

        <button
          type="button"
          onClick={() => setCreateOpen((v) => !v)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-primary/90 to-primary px-4 py-3.5 text-left text-white shadow-sm shadow-primary/25 transition hover:brightness-105 active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
            <LuSparkles size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Новый план с ИИ</span>
            <span className="block text-xs text-white/75">Цель, срок — и готовое расписание</span>
          </span>
          <LuArrowRight size={18} className="opacity-80" />
        </button>

        {createOpen ? (
          <div className="mb-6 space-y-3 border-b border-stone-200/80 pb-6">
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-2xl border border-stone-200 bg-white px-3.5 py-3 text-sm text-stone-900 outline-none ring-primary/30 placeholder:text-stone-400 focus:ring-2"
              placeholder="Например: Евангелия за 30 дней, Псалмы на месяц…"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-stone-600">
                Дней
                <input
                  type="number"
                  min={3}
                  max={90}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value) || 7)}
                  className="w-20 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
              <button
                type="button"
                className="ml-auto rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!goal.trim() || genMut.isPending}
                onClick={() => genMut.mutate()}
              >
                {genMut.isPending ? 'Генерация…' : 'Сгенерировать'}
              </button>
            </div>
          </div>
        ) : null}

        {plansQ.isLoading ? (
          <p className="py-8 text-center text-sm text-stone-400">Загрузка…</p>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <LuBookOpen className="mb-3 text-stone-300" size={36} />
            <p className="text-sm font-medium text-stone-600">Пока нет планов</p>
            <p className="mt-1 max-w-xs text-sm text-stone-400">
              Создайте первый — ИИ составит дни и ссылки на отрывки.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone-100">
            {plans.map((p) => {
              const { done, total, pct } = planProgress(p);
              return (
                <li key={p.id}>
                  <Link
                    to={`/bible/plans/${p.id}`}
                    className="group flex items-center gap-3 py-4 transition hover:bg-stone-50/80"
                  >
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-stone-200"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeDasharray={`${pct} 100`}
                          strokeLinecap="round"
                          className="text-primary transition-all duration-500"
                        />
                      </svg>
                      <span className="text-[11px] font-bold tabular-nums text-stone-700">
                        {pct}%
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-stone-900 group-hover:text-primary">
                        {p.title}
                      </p>
                      {p.goal ? (
                        <p className="mt-0.5 line-clamp-1 text-sm text-stone-500">{p.goal}</p>
                      ) : null}
                      <p className="mt-1 text-xs tabular-nums text-stone-400">
                        {total > 0 ? `${done} из ${total} дней` : 'Без расписания'}
                      </p>
                    </div>
                    <LuArrowRight
                      size={18}
                      className="shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function BiblePlanDetailPage() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const translation = readStoredTranslation('synodal');

  const planQ = useQuery({
    queryKey: ['bible', 'plan', id],
    queryFn: () => fetchBiblePlan(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const completeMut = useMutation({
    mutationFn: (vars: { dayIndex: number; completed: boolean }) =>
      completeBiblePlanDay(id, vars.dayIndex, vars.completed),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'plan', id] });
      void qc.invalidateQueries({ queryKey: ['bible', 'plans'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteBiblePlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'plans'] });
      void navigate('/bible/plans');
    },
  });

  const plan = planQ.data;
  const days = plan?.days ?? [];
  const { done, total, pct } = plan ? planProgress(plan) : { done: 0, total: 0, pct: 0 };
  const next = useMemo(() => nextUnreadDay(days), [days]);

  function openRef(ref: BiblePlanRef) {
    void navigate(biblePlanRefUrl(ref, translation));
  }

  function openDay(day: BiblePlanDay) {
    const ref = firstRef(day);
    if (ref) openRef(ref);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Библия" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-4">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            to="/bible/plans"
            className="inline-flex items-center gap-1 text-sm font-semibold text-stone-500 transition hover:text-primary"
          >
            <LuChevronLeft size={16} /> Планы
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-stone-400 transition hover:text-red-600"
            onClick={() => {
              if (window.confirm('Удалить этот план чтения?')) deleteMut.mutate();
            }}
          >
            <LuTrash2 size={14} /> Удалить
          </button>
        </div>

        {planQ.isLoading ? (
          <p className="py-10 text-center text-sm text-stone-400">Загрузка…</p>
        ) : !plan ? (
          <p className="py-10 text-center text-sm text-stone-500">План не найден</p>
        ) : (
          <>
            <header className="mb-5">
              <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
                {plan.title}
              </h1>
              {plan.goal ? (
                <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{plan.goal}</p>
              ) : null}
              <div className="mt-4">
                <div className="mb-1.5 flex items-baseline justify-between text-xs text-stone-500">
                  <span>
                    {done} из {total} дней
                  </span>
                  <span className="font-semibold tabular-nums text-stone-700">{pct}%</span>
                </div>
                <ProgressBar pct={pct} />
              </div>
            </header>

            {next ? (
              <button
                type="button"
                onClick={() => openDay(next)}
                className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-primary/20 bg-primary/[0.06] px-4 py-3.5 text-left transition hover:bg-primary/[0.1] active:scale-[0.99]"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white">
                  {next.day_index}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-primary">
                    Читать сегодня
                  </span>
                  <span className="mt-0.5 block truncate font-semibold text-stone-900">
                    {next.label || `День ${next.day_index}`}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-stone-500">
                    {(next.refs_json ?? []).map(formatBiblePlanRef).join(' · ') || 'Отрывок'}
                  </span>
                </span>
                <LuBookOpen className="shrink-0 text-primary" size={20} />
              </button>
            ) : total > 0 ? (
              <p className="mb-6 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                План пройден — все дни отмечены.
              </p>
            ) : null}

            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Расписание
            </h2>

            <ol className="divide-y divide-stone-100">
              {days.map((day) => {
                const isDone = Boolean(day.completed_at);
                const refs = day.refs_json ?? [];
                const isNext = next?.id === day.id;
                return (
                  <li
                    key={day.id}
                    className={[
                      'py-3.5 transition',
                      isNext ? 'bg-primary/[0.03]' : '',
                      isDone ? 'opacity-70' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        aria-label={isDone ? 'Снять отметку' : 'Отметить прочитанным'}
                        disabled={completeMut.isPending}
                        onClick={() =>
                          completeMut.mutate({ dayIndex: day.day_index, completed: !isDone })
                        }
                        className={[
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition',
                          isDone
                            ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-stone-300 bg-white text-transparent hover:border-primary hover:text-primary/40',
                        ].join(' ')}
                      >
                        <LuCheck size={16} strokeWidth={2.5} />
                      </button>

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => openDay(day)}
                          className="w-full text-left"
                        >
                          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="text-xs font-bold tabular-nums text-stone-400">
                              День {day.day_index}
                            </span>
                            {day.label ? (
                              <span
                                className={[
                                  'font-semibold',
                                  isDone ? 'text-stone-500 line-through' : 'text-stone-900',
                                ].join(' ')}
                              >
                                {day.label}
                              </span>
                            ) : null}
                          </p>
                        </button>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {refs.length === 0 ? (
                            <span className="text-sm text-stone-400">Нет отрывков</span>
                          ) : (
                            refs.map((ref, i) => (
                              <Link
                                key={`${ref.book_slug}-${ref.chapter}-${i}`}
                                to={biblePlanRefUrl(ref, translation)}
                                className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-sm font-semibold text-stone-800 transition hover:bg-primary hover:text-white"
                              >
                                {formatBiblePlanRef(ref)}
                                <LuArrowRight size={12} className="opacity-60" />
                              </Link>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {next && firstRef(next) ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[calc(1rem+var(--app-bottom-nav-total-height,0px))]">
          <button
            type="button"
            onClick={() => openDay(next)}
            className="pointer-events-auto inline-flex max-w-md flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/30 transition hover:brightness-105 active:scale-[0.98]"
          >
            <LuBookOpen size={18} />
            Открыть день {next.day_index}
          </button>
        </div>
      ) : null}
    </div>
  );
}
