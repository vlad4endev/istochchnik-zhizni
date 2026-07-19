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

function planKey(plan: SundaySchedulePlan, index: number): string {
  return `${plan.service_date}-${plan.id}-${index}`;
}

function RoleRow({
  icon: Icon,
  label,
  name,
}: {
  icon: typeof LuUser;
  label: string;
  name: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-xl bg-white/90 p-2.5 ring-1 ring-stone-100">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-extrabold leading-snug text-stone-900">{name}</p>
      </div>
    </div>
  );
}

export function UpcomingSundayServicesWidget({
  plans,
  loading = false,
  onSelect,
  title = 'Ближайшие собрания',
  emptyText = 'Нет запланированных собраний',
}: Props) {
  if (loading) {
    return (
      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.06] via-white to-stone-50 shadow-[var(--shadow-card)] dark:border-[var(--border)] dark:bg-[var(--surface-elevated)] dark:bg-none">
        <div className="border-b border-stone-100/80 px-3 py-3 sm:px-4">
          <div className="h-5 w-40 animate-pulse rounded-lg bg-stone-200" />
        </div>
        <div className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-3 sm:gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-stone-100 sm:h-32" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-gradient-to-br from-primary/[0.06] via-white to-stone-50 shadow-[var(--shadow-card)] dark:border-[var(--border)] dark:bg-[var(--surface-elevated)] dark:bg-none">
      <div className="flex items-center gap-2.5 border-b border-stone-100/80 px-3 py-3 sm:px-4 dark:border-[var(--border)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <LuCalendarDays className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-extrabold text-stone-900 sm:text-base">{title}</h2>
          <p className="text-[11px] font-semibold text-stone-500">Следующие 3 воскресных служения</p>
        </div>
      </div>

      {plans.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm font-semibold text-stone-500 sm:px-4">{emptyText}</p>
      ) : (
        <div className="flex flex-col gap-2 p-3 sm:grid sm:grid-cols-3 sm:gap-3 sm:p-3">
          {plans.map((plan, index) => {
            const isNext = index === 0;
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      'flex w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl px-2 py-2 text-center sm:w-auto sm:min-w-[3rem]',
                      isNext ? 'bg-primary text-white shadow-sm' : 'bg-stone-100 text-stone-800',
                    ].join(' ')}
                  >
                    <span className="text-[10px] font-extrabold uppercase leading-none opacity-90">
                      {formatSundayMonthShort(plan.service_date)}
                    </span>
                    <span className="text-xl font-extrabold leading-tight sm:text-2xl">
                      {formatSundayDayNumber(plan.service_date)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                        {formatSundayDateWeekday(plan.service_date)}
                      </p>
                      {isNext ? (
                        <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                          Ближайшее
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm font-extrabold leading-snug text-stone-900">
                      {serviceTitle(plan)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-stone-500">
                      {formatSundayDateShort(plan.service_date)}
                      {plan.start_time ? ` · ${plan.start_time}` : ''}
                    </p>
                    {!plan.has_program ? (
                      <p className="mt-1 text-[10px] font-semibold text-stone-400">Программа ещё не создана</p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-1">
                  <RoleRow icon={LuUser} label="Ведущий" name={plan.leader?.name ?? '—'} />
                  <RoleRow icon={LuMic} label="Проповедник" name={plan.preacher?.name ?? '—'} />
                </div>
              </>
            );

            const className = [
              'tap-highlight-transparent touch-manipulation w-full rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.99]',
              isNext
                ? 'border-primary/25 bg-white ring-1 ring-primary/10'
                : 'border-stone-200/80 bg-white/90 hover:border-primary/15',
            ].join(' ');

            const key = planKey(plan, index);

            if (onSelect) {
              return (
                <button key={key} type="button" className={className} onClick={() => onSelect(plan)}>
                  {body}
                </button>
              );
            }

            return (
              <article key={key} className={className}>
                {body}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
