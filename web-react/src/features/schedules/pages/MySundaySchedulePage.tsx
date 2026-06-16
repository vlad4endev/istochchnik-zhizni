import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  addWeeks,
  format,
  isBefore,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuArrowLeft, LuExternalLink, LuLoaderCircle, LuMic, LuUser } from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { fetchMySundaySchedule, type SundaySchedulePlan } from '../api/sundayScheduleApi';
import { MinistryScheduleSwitcher } from '../components/MinistryScheduleSwitcher';
import { MySundayParticipationCalendar } from '../components/MySundayParticipationCalendar';
import { UpcomingSundayServicesWidget } from '../components/UpcomingSundayServicesWidget';
import {
  formatSundayDateShort,
  formatSundayDateWeekday,
  mySundayRole,
  plansByServiceDate,
  serviceTitle,
  upcomingSundayPlans,
} from '../utils/sundayScheduleDisplay';
import { useMe } from '../../../hooks/useMe';

export function MySundaySchedulePage() {
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const memberId = useAuthStore((s) => s.memberId);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));

  const resolvedMemberId = memberId ?? (typeof meQ.data?.id === 'number' ? meQ.data.id : null);

  const from = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const to = useMemo(() => format(addWeeks(new Date(), 16), 'yyyy-MM-dd'), []);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [focusedPlanId, setFocusedPlanId] = useState<number | null>(null);

  const scheduleQ = useQuery({
    queryKey: ['sunday-schedule', 'my', from, to],
    queryFn: () => fetchMySundaySchedule({ from, to }),
  });

  const today = startOfDay(new Date());
  const rows = scheduleQ.data ?? [];
  const upcoming = useMemo(() => upcomingSundayPlans(rows, 3), [rows]);
  const dateMap = useMemo(() => plansByServiceDate(rows), [rows]);

  const upcomingRows = useMemo(
    () =>
      rows
        .filter((p) => !isBefore(parseISO(p.service_date), today))
        .sort((a, b) => a.service_date.localeCompare(b.service_date)),
    [rows, today],
  );

  const monthRows = useMemo(
    () =>
      upcomingRows.filter((p) => isSameMonth(parseISO(p.service_date), month)),
    [upcomingRows, month],
  );

  useEffect(() => {
    if (focusedPlanId == null) return;
    document.getElementById(`sunday-my-plan-${focusedPlanId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }, [focusedPlanId]);

  const upcomingCount = rows.filter((p) => !isBefore(parseISO(p.service_date), today)).length;

  function handleSelectPlan(plan: SundaySchedulePlan) {
    setFocusedPlanId(plan.id);
    setMonth(startOfMonth(parseISO(plan.service_date)));
  }

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex items-center gap-3">
          <Link
            to="/schedules/sunday"
            className="tap-highlight-transparent grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200 bg-white text-stone-800 shadow-sm hover:bg-stone-50 active:bg-stone-100"
            aria-label="К расписанию"
          >
            <LuArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Моё расписание</h1>
            <p className="text-[13px] font-semibold text-stone-500 sm:text-sm">
              Воскресное служение
              {upcomingCount > 0 ? (
                <span className="ml-1.5 text-primary">· {upcomingCount} предстоящих</span>
              ) : null}
            </p>
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
        ) : (
          <>
            <UpcomingSundayServicesWidget
              plans={upcoming}
              onSelect={handleSelectPlan}
              title="Мои ближайшие собрания"
              emptyText="В ближайшие недели ваших назначений нет"
            />

            <MySundayParticipationCalendar
              month={month}
              onMonthChange={setMonth}
              plansByDate={dateMap}
              memberId={resolvedMemberId}
              onSelectPlan={handleSelectPlan}
              selectedDate={
                focusedPlanId != null
                  ? rows.find((p) => p.id === focusedPlanId)?.service_date ?? null
                  : null
              }
            />

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-sm font-extrabold text-stone-800">
                  Назначения · {format(month, 'LLLL yyyy', { locale: ru })}
                </h2>
                {monthRows.length > 0 ? (
                  <span className="text-xs font-semibold text-stone-500">{monthRows.length} служ.</span>
                ) : null}
              </div>
              {monthRows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-600">
                  В этом месяце назначений нет.
                </p>
              ) : (
                <ul className="space-y-2">
                  {monthRows.map((plan) => {
                    const dt = parseISO(plan.service_date);
                    const past = isBefore(dt, today);
                    const participation = mySundayRole(plan, resolvedMemberId);
                    const focused = focusedPlanId === plan.id;

                    return (
                      <li key={plan.id} id={`sunday-my-plan-${plan.id}`}>
                        <article
                          className={[
                            'overflow-hidden rounded-2xl border bg-white shadow-sm transition',
                            past ? 'border-stone-200 opacity-70' : 'border-primary/20',
                            focused ? 'ring-2 ring-primary/30' : '',
                          ].join(' ')}
                        >
                          <div className="h-1 w-full bg-primary/70" />
                          <div className="px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <span className="inline-flex rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-stone-700">
                                  {serviceTitle(plan)}
                                </span>
                                <p className="mt-2 text-base font-extrabold text-stone-900">
                                  {formatSundayDateShort(plan.service_date)}
                                </p>
                                <p className="text-xs font-semibold capitalize text-stone-500">
                                  {formatSundayDateWeekday(plan.service_date)}
                                  {plan.start_time ? ` · ${plan.start_time}` : ''}
                                </p>
                              </div>
                              {participation ? (
                                <span
                                  className={[
                                    'inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold',
                                    participation === 'Ведущий'
                                      ? 'bg-sky-100 text-sky-800'
                                      : 'bg-violet-100 text-violet-800',
                                  ].join(' ')}
                                >
                                  {participation}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-stone-50 px-3 py-2.5">
                                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                                  <LuUser className="h-3.5 w-3.5" />
                                  Ведущий
                                </p>
                                <p className="mt-1 text-sm font-extrabold text-stone-900">
                                  {plan.leader?.name ?? '—'}
                                </p>
                              </div>
                              <div className="rounded-xl bg-stone-50 px-3 py-2.5">
                                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
                                  <LuMic className="h-3.5 w-3.5" />
                                  Проповедник
                                </p>
                                <p className="mt-1 text-sm font-extrabold text-stone-900">
                                  {plan.preacher?.name ?? '—'}
                                </p>
                              </div>
                            </div>

                            <Link
                              to="/service-planner"
                              state={{ openPlanId: plan.id }}
                              className="tap-highlight-transparent mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-primary hover:underline active:opacity-80"
                            >
                              <LuExternalLink className="h-3.5 w-3.5" />
                              Открыть программу
                            </Link>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
