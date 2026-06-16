import { LuCalendarDays, LuMic, LuUser } from 'react-icons/lu';

import type { SundaySchedulePlan } from '../api/sundayScheduleApi';
import {
  formatSundayDateShort,
  formatSundayDateWeekday,
  formatSundayDayNumber,
  formatSundayMonthShort,
  serviceTitle,
} from '../utils/sundayScheduleDisplay';

type Props = {
  plans: SundaySchedulePlan[];
  loading?: boolean;
  onSelect?: (plan: SundaySchedulePlan) => void;
  title?: string;
  emptyText?: string;
};

export function UpcomingSundayServicesWidget({
  plans,
  loading = false,
  onSelect,
  title = 'Ближайшие собрания',
  emptyText = 'Нет запланированных собраний',
}: Props) {
  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.06] via-white to-stone-50 shadow-[var(--shadow-card)]">
        <div className="border-b border-stone-100/80 px-4 py-3">
          <div className="h-5 w-40 animate-pulse rounded-lg bg-stone-200" />
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-100" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.06] via-white to-stone-50 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-stone-100/80 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <LuCalendarDays className="h-4 w-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-extrabold text-stone-900 sm:text-base">{title}</h2>
          <p className="text-[11px] font-semibold text-stone-500">Следующие 3 воскресных служения</p>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm font-semibold text-stone-500">{emptyText}</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto p-3 pb-4 snap-x snap-mandatory sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-3">
          {plans.map((plan, index) => {
            const isNext = index === 0;
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      'flex shrink-0 flex-col items-center justify-center rounded-2xl px-2.5 py-2 text-center',
                      isNext ? 'bg-primary text-white shadow-sm' : 'bg-stone-100 text-stone-800',
                    ].join(' ')}
                  >
                    <span className="text-[10px] font-extrabold uppercase leading-none opacity-90">
                      {formatSundayMonthShort(plan.service_date)}
                    </span>
                    <span className="text-2xl font-extrabold leading-tight">{formatSundayDayNumber(plan.service_date)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                      {formatSundayDateWeekday(plan.service_date)}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-extrabold text-stone-900">{serviceTitle(plan)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-stone-500">
                      {formatSundayDateShort(plan.service_date)}
                      {plan.start_time ? ` · ${plan.start_time}` : ''}
                    </p>
                  </div>
                </div>
                <div className="mt-3 space-y-1.5 rounded-xl bg-white/80 p-2.5 ring-1 ring-stone-100">
                  <div className="flex items-center gap-2 text-xs">
                    <LuUser className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="font-bold text-stone-500">Ведущий</span>
                    <span className="min-w-0 truncate font-extrabold text-stone-900">
                      {plan.leader?.name ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <LuMic className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="font-bold text-stone-500">Проповедник</span>
                    <span className="min-w-0 truncate font-extrabold text-stone-900">
                      {plan.preacher?.name ?? '—'}
                    </span>
                  </div>
                </div>
                {isNext ? (
                  <span className="mt-2 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                    Ближайшее
                  </span>
                ) : null}
              </>
            );

            const className = [
              'tap-highlight-transparent min-w-[min(100%,280px)] shrink-0 snap-start rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.99] sm:min-w-0',
              isNext
                ? 'border-primary/25 bg-white ring-1 ring-primary/10'
                : 'border-stone-200/80 bg-white/90 hover:border-primary/15',
            ].join(' ');

            if (onSelect) {
              return (
                <button key={plan.id} type="button" className={className} onClick={() => onSelect(plan)}>
                  {body}
                </button>
              );
            }

            return (
              <article key={plan.id} className={className}>
                {body}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
