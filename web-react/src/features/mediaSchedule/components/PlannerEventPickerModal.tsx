import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuLoaderCircle, LuSearch, LuX } from 'react-icons/lu';

import { fetchServicePlans, type ServicePlanListItem } from '../../servicePlanner/api';
import { formatPlannerEventLabel } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  from: Date;
  to: Date;
  onSelect: (plan: ServicePlanListItem) => void;
};

export function PlannerEventPickerModal({ open, onClose, from, to, onSelect }: Props) {
  const [search, setSearch] = useState('');

  const plansQ = useQuery({
    queryKey: ['service-plans', 'media-picker', from.toISOString(), to.toISOString()],
    queryFn: () =>
      fetchServicePlans({
        from: format(from, 'yyyy-MM-dd'),
        to: format(to, 'yyyy-MM-dd'),
        include_archived: false,
      }),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const plans = (plansQ.data ?? []).filter((p) => !p.is_archived);
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((p) => {
      const label = formatPlannerEventLabel({
        title: p.template_name ?? 'Служение',
        event_date: p.service_date,
        start_time: p.start_time,
        template_name: p.template_name,
      }).toLowerCase();
      return label.includes(q) || p.service_date.includes(q);
    });
  }, [plansQ.data, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[111] flex max-h-[min(92dvh,560px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-stone-200/80 bg-white shadow-2xl sm:max-h-[min(90dvh,560px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-100 px-4 py-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-stone-900">Выберите служение</h2>
              <p className="text-xs font-semibold text-stone-500">Из планировщика за выбранный период</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <LuX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3">
          <div className="relative">
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию или дате"
              className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-9 pr-3 text-base sm:py-2 sm:text-sm"
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {plansQ.isLoading ? (
            <li className="flex justify-center py-10 text-[var(--text-muted)]">
              <LuLoaderCircle className="h-7 w-7 animate-spin" />
            </li>
          ) : filtered.length === 0 ? (
            <li className="py-8 text-center text-sm text-[var(--text-muted)]">
              Нет планов служений в этом периоде
            </li>
          ) : (
            filtered.map((plan) => {
              const label = formatPlannerEventLabel({
                title: plan.template_name ?? 'Служение',
                event_date: plan.service_date,
                start_time: plan.start_time,
                template_name: plan.template_name,
              });
              const dateHuman = format(parseISO(plan.service_date), 'd MMMM', { locale: ru });
              return (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(plan);
                      onClose();
                    }}
                    className="tap-highlight-transparent flex w-full min-h-[52px] flex-col justify-center rounded-xl border border-stone-200 bg-white px-3 py-3 text-left active:bg-primary/5 sm:py-2.5"
                  >
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{dateHuman}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
