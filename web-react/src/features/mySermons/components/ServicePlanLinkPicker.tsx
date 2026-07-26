import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuCalendarDays, LuCheck, LuLink2Off, LuSearch, LuX } from 'react-icons/lu';

import { fetchServicePlans, type ServicePlanListItem } from '../../servicePlanner/api';
import { formatPlanServiceDate } from '../api';

type Props = {
  value: number | null;
  selectedLabel?: {
    service_date: string | null;
    start_time: string | null;
    template_name: string | null;
  } | null;
  onChange: (planId: number | null) => void;
  disabled?: boolean;
};

function planLabel(plan: ServicePlanListItem): string {
  const date = formatPlanServiceDate(plan.service_date);
  const time = plan.start_time?.slice(0, 5) || '';
  const tpl = plan.template_name?.trim() || 'Программа служения';
  return [date, time, tpl].filter(Boolean).join(' · ');
}

export function ServicePlanLinkPicker({ value, selectedLabel, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const plansQ = useQuery({
    queryKey: ['service-plans', 'sermon-note-picker'],
    queryFn: () => fetchServicePlans({ include_archived: false }),
    enabled: open,
    staleTime: 30_000,
  });

  const plans = useMemo(() => {
    const list = Array.isArray(plansQ.data) ? plansQ.data : [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sorted = [...list].sort((a, b) => {
      const ad = a.service_date || '';
      const bd = b.service_date || '';
      return ad.localeCompare(bd);
    });
    return sorted;
  }, [plansQ.data]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return plans;
    return plans.filter((p) => planLabel(p).toLowerCase().includes(t));
  }, [plans, query]);

  const currentText = useMemo(() => {
    if (value == null) return null;
    if (selectedLabel?.service_date) {
      const date = formatPlanServiceDate(selectedLabel.service_date);
      const time = selectedLabel.start_time?.slice(0, 5) || '';
      const tpl = selectedLabel.template_name?.trim() || 'Программа служения';
      return [date, time, tpl].filter(Boolean).join(' · ');
    }
    const found = plans.find((p) => p.id === value);
    return found ? planLabel(found) : `Программа #${value}`;
  }, [value, selectedLabel, plans]);

  return (
    <div className="rounded-xl border border-stone-200 bg-gradient-to-br from-[#FBF7F4] to-white px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Служение</p>
          {currentText ? (
            <p className="mt-1 text-sm font-semibold text-stone-900">{currentText}</p>
          ) : (
            <p className="mt-1 text-sm text-stone-500">
              Выберите дату и программу — конспект появится в блоке «Проповедь».
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {value != null ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              <LuLink2Off className="h-3.5 w-3.5" aria-hidden />
              Отвязать
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-95 disabled:opacity-50"
          >
            <LuCalendarDays className="h-3.5 w-3.5" aria-hidden />
            {value != null ? 'Изменить' : 'Выбрать программу'}
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[80dvh] w-full max-w-lg flex-col rounded-2xl border border-stone-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Программа служения</h2>
                <p className="text-xs text-stone-500">Когда будет эта проповедь</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
                aria-label="Закрыть"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-stone-100 px-4 py-2">
              <label className="relative block">
                <LuSearch
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск по дате или названию…"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm outline-none ring-primary/25 focus:bg-white focus:ring-2"
                />
              </label>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {plansQ.isLoading ? (
                <li className="px-3 py-8 text-center text-sm text-stone-500">Загрузка программ…</li>
              ) : plansQ.isError ? (
                <li className="px-3 py-8 text-center text-sm text-red-600">Не удалось загрузить программы</li>
              ) : filtered.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-stone-500">Программы не найдены</li>
              ) : (
                filtered.map((plan) => {
                  const selected = value === plan.id;
                  return (
                    <li key={plan.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(plan.id);
                          setOpen(false);
                          setQuery('');
                        }}
                        className={[
                          'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition',
                          selected ? 'bg-primary/10' : 'hover:bg-stone-50',
                        ].join(' ')}
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm ring-1 ring-stone-200">
                          <LuCalendarDays className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-stone-900">
                            {formatPlanServiceDate(plan.service_date)}
                            {plan.start_time ? ` · ${plan.start_time.slice(0, 5)}` : ''}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-stone-500">
                            {plan.template_name?.trim() || 'Программа служения'}
                            {plan.status === 'draft' ? ' · черновик' : ''}
                          </span>
                        </span>
                        {selected ? <LuCheck className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
