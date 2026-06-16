import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { addWeeks, format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuArrowLeft, LuCalendarDays, LuLoaderCircle } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { fetchMySundaySchedule } from '../api/sundayScheduleApi';
import { MinistryScheduleSwitcher } from '../components/MinistryScheduleSwitcher';
import { useMe } from '../../../hooks/useMe';

export function MySundaySchedulePage() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const memberId = useAuthStore((s) => s.memberId);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));

  const from = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const to = useMemo(() => format(addWeeks(new Date(), 8), 'yyyy-MM-dd'), []);

  const scheduleQ = useQuery({
    queryKey: ['sunday-schedule', 'my', from, to],
    queryFn: () => fetchMySundaySchedule({ from, to }),
  });

  const today = startOfDay(new Date());
  const rows = scheduleQ.data ?? [];

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/schedules/sunday"
            className="grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 shadow-sm hover:bg-stone-50"
            aria-label="К расписанию"
          >
            <LuArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Моё расписание</h1>
            <p className="text-[13px] font-semibold text-stone-500 sm:text-sm">Воскресное служение · ближайшие 8 недель</p>
          </div>
        </div>

        <MinistryScheduleSwitcher
          role={role}
          ministryDirection={meQ.data?.ministry_direction}
          ministryRole={meQ.data?.ministry_role}
          roles={roles}
          active="sunday"
        />

        {scheduleQ.isLoading ? (
          <div className="flex justify-center py-12 text-stone-500">
            <LuLoaderCircle className="h-8 w-8 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-600">
            В ближайшие недели назначений нет.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((plan) => {
              const dt = parseISO(plan.service_date);
              const past = isBefore(dt, today);
              const myRole =
                memberId === plan.leader_member_id
                  ? 'Ведущий'
                  : memberId === plan.preacher_member_id
                    ? 'Проповедник'
                    : 'Участник';
              return (
                <div
                  key={plan.id}
                  className={[
                    'rounded-2xl border bg-white px-4 py-3 shadow-sm',
                    past ? 'border-stone-200 opacity-70' : 'border-primary/20',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-stone-900">
                        {format(dt, 'd MMMM yyyy', { locale: ru })}
                        {plan.start_time ? ` · ${plan.start_time}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-primary">{myRole}</p>
                    </div>
                    <LuCalendarDays className="h-5 w-5 shrink-0 text-stone-400" />
                  </div>
                  <p className="mt-2 text-xs text-stone-600">
                    Ведущий: {plan.leader?.name ?? '—'} · Проповедник: {plan.preacher?.name ?? '—'}
                  </p>
                  <Link
                    to="/service-planner"
                    state={{ openPlanId: plan.id }}
                    className="mt-2 inline-block text-xs font-bold text-primary hover:underline"
                  >
                    Открыть программу
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
