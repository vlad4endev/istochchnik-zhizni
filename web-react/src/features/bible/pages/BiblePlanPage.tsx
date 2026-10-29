import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuCheck, LuSparkles, LuTrash2 } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { emitAppToast } from '@/lib/uiFeedback';

import {
  completeBiblePlanDay,
  deleteBiblePlan,
  fetchBiblePlan,
  fetchBiblePlans,
  generateBiblePlan,
} from '../api';

export function BiblePlansListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [goal, setGoal] = useState('Евангелия за 30 дней');
  const [days, setDays] = useState(30);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Планы чтения" />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-5">
        <Link to="/bible" className="text-sm font-semibold text-primary">
          ← К Библии
        </Link>

        <div className="rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4">
          <p className="flex items-center gap-2 font-bold text-stone-900">
            <LuSparkles className="text-primary" /> Создать с ИИ
          </p>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            className="mt-3 w-full rounded-2xl border border-stone-200 px-3 py-2 text-sm"
            placeholder="Цель плана…"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
            Дней
            <input
              type="number"
              min={3}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 7)}
              className="w-20 rounded-lg border border-stone-200 px-2 py-1"
            />
          </label>
          <button
            type="button"
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={!goal.trim() || genMut.isPending}
            onClick={() => genMut.mutate()}
          >
            {genMut.isPending ? 'Генерация…' : 'Сгенерировать план'}
          </button>
        </div>

        {(plansQ.data ?? []).map((p) => (
          <Link
            key={p.id}
            to={`/bible/plans/${p.id}`}
            className="rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] px-4 py-3"
          >
            <p className="font-bold text-stone-900">{p.title}</p>
            {p.goal ? <p className="mt-1 text-sm text-stone-600 line-clamp-2">{p.goal}</p> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function BiblePlanDetailPage() {
  const { planId } = useParams();
  const id = Number(planId);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const planQ = useQuery({
    queryKey: ['bible', 'plan', id],
    queryFn: () => fetchBiblePlan(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const completeMut = useMutation({
    mutationFn: (vars: { dayIndex: number; completed: boolean }) =>
      completeBiblePlanDay(id, vars.dayIndex, vars.completed),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bible', 'plan', id] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteBiblePlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bible', 'plans'] });
      void navigate('/bible/plans');
    },
  });

  const plan = planQ.data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={sectionHeroStickyClass}>
        <PageHeader title={plan?.title || 'План'} />
      </div>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-5">
        <div className="flex items-center justify-between gap-2">
          <Link to="/bible/plans" className="text-sm font-semibold text-primary">
            ← Планы
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600"
            onClick={() => deleteMut.mutate()}
          >
            <LuTrash2 size={14} /> Удалить
          </button>
        </div>
        {plan?.goal ? <p className="text-sm text-stone-600">{plan.goal}</p> : null}
        {(plan?.days ?? []).map((day) => {
          const done = Boolean(day.completed_at);
          return (
            <div
              key={day.id}
              className={[
                'rounded-2xl border px-4 py-3',
                done ? 'border-emerald-200 bg-emerald-50/60' : 'border-stone-200/70 bg-[var(--surface-elevated)]',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-stone-900">
                    День {day.day_index}
                    {day.label ? ` · ${day.label}` : ''}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {day.refs_json.map((ref, i) => (
                      <li key={`${ref.book_slug}-${ref.chapter}-${i}`}>
                        <Link
                          className="text-sm font-semibold text-primary"
                          to={`/bible/synodal/${ref.book_slug}/${ref.chapter}${
                            ref.verse_start != null ? `?v=${ref.verse_start}` : ''
                          }`}
                        >
                          {ref.book_slug} {ref.chapter}
                          {ref.verse_start != null ? `:${ref.verse_start}` : ''}
                          {ref.verse_end != null && ref.verse_end !== ref.verse_start
                            ? `–${ref.verse_end}`
                            : ''}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className={[
                    'inline-flex h-9 w-9 items-center justify-center rounded-full border',
                    done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-stone-300 text-stone-400',
                  ].join(' ')}
                  aria-label={done ? 'Снять отметку' : 'Отметить прочитанным'}
                  onClick={() =>
                    completeMut.mutate({ dayIndex: day.day_index, completed: !done })
                  }
                >
                  <LuCheck size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
