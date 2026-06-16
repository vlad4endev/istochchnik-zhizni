import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isSunday,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuCalendarDays,
  LuChevronLeft,
  LuChevronRight,
  LuExternalLink,
  LuLoaderCircle,
  LuUser,
  LuX,
} from 'react-icons/lu';

import { useIsMobile } from '../../../hooks/useIsMobile';

import { useMe } from '../../../hooks/useMe';
import { useAuthStore } from '../../auth/authStore';
import {
  fetchSundayScheduleMembers,
  fetchSundaySchedulePlans,
  patchSundaySchedulePlan,
  type SundaySchedulePlan,
} from '../api/sundayScheduleApi';
import { apiErrorMessage } from '../../mediaSchedule/api';
import { MinistryScheduleSwitcher } from '../components/MinistryScheduleSwitcher';
import { SundayScheduleTableView } from '../components/SundayScheduleTableView';
import { UpcomingSundayServicesWidget } from '../components/UpcomingSundayServicesWidget';
import { canManageSundaySchedule } from '../ministryScheduleAccess';
import { firstNameOnly, upcomingSundayPlans } from '../utils/sundayScheduleDisplay';
import {
  buildSundayScheduleTableModel,
  tableRangeYmd,
} from '../utils/sundayScheduleTableModel';
import { memberHasMinistryRole as matchRole } from '../../mediaSchedule/ministryRoleMatch';

type SundayViewMode = 'calendar' | 'table';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function capitalizeRuMonthTitle(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mobileSheetFooterClass(): string {
  return 'border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]';
}

function readonlyFieldClass(): string {
  return 'rounded-xl border border-stone-100 bg-stone-50 px-3 py-3 text-sm font-semibold text-stone-900';
}

function ymd(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function formatRuDateLong(dateIso: string): string {
  const dt = parseISO(dateIso);
  if (Number.isNaN(dt.getTime())) return dateIso;
  return format(dt, 'd MMMM yyyy', { locale: ru });
}

function leaderCandidates(members: Awaited<ReturnType<typeof fetchSundayScheduleMembers>>) {
  return members.filter((m) => matchRole(m.ministry_role, 'Ведущий'));
}

function preacherCandidates(members: Awaited<ReturnType<typeof fetchSundayScheduleMembers>>) {
  return members.filter((m) => matchRole(m.ministry_role, 'Проповедник'));
}

export function SundaySchedulePage() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [viewMode, setViewMode] = useState<SundayViewMode>('calendar');
  const [tablePeriodStart, setTablePeriodStart] = useState(() => startOfMonth(new Date()));
  const [selectedPlan, setSelectedPlan] = useState<SundaySchedulePlan | null>(null);
  const [leaderId, setLeaderId] = useState<number | ''>('');
  const [preacherId, setPreacherId] = useState<number | ''>('');

  const rangeFrom = useMemo(() => ymd(startOfWeek(startOfMonth(month), { weekStartsOn: 1 })), [month]);
  const rangeTo = useMemo(() => ymd(endOfWeek(endOfMonth(month), { weekStartsOn: 1 })), [month]);

  const plansQ = useQuery({
    queryKey: ['sunday-schedule', 'plans', rangeFrom, rangeTo],
    queryFn: () => fetchSundaySchedulePlans({ from: rangeFrom, to: rangeTo }),
  });

  const upcomingRangeTo = useMemo(() => ymd(addMonths(startOfDay(new Date()), 4)), []);
  const upcomingRangeFrom = useMemo(() => ymd(startOfDay(new Date())), []);

  const upcomingQ = useQuery({
    queryKey: ['sunday-schedule', 'upcoming', upcomingRangeFrom, upcomingRangeTo],
    queryFn: () => fetchSundaySchedulePlans({ from: upcomingRangeFrom, to: upcomingRangeTo }),
  });

  const upcomingThree = useMemo(
    () => upcomingSundayPlans(upcomingQ.data ?? [], 3),
    [upcomingQ.data],
  );

  const membersQ = useQuery({
    queryKey: ['sunday-schedule', 'members'],
    queryFn: fetchSundayScheduleMembers,
  });

  const tableRange = useMemo(() => tableRangeYmd(tablePeriodStart), [tablePeriodStart]);

  const tablePlansQ = useQuery({
    queryKey: ['sunday-schedule', 'table', tableRange.from, tableRange.to],
    queryFn: () => fetchSundaySchedulePlans({ from: tableRange.from, to: tableRange.to }),
  });

  const canManage = canManageSundaySchedule(role, meQ.data?.ministry_role, roles);

  const plansByDate = useMemo(() => {
    const map = new Map<string, SundaySchedulePlan>();
    for (const p of plansQ.data ?? []) {
      map.set(p.service_date, p);
    }
    return map;
  }, [plansQ.data]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const patchMut = useMutation({
    mutationFn: (body: { planId: number; leader_member_id?: number | null; preacher_member_id?: number | null }) =>
      patchSundaySchedulePlan(body.planId, {
        leader_member_id: body.leader_member_id,
        preacher_member_id: body.preacher_member_id,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sunday-schedule'] });
      void qc.invalidateQueries({ queryKey: ['service-planner'] });
      setSelectedPlan(null);
    },
  });

  const leaders = useMemo(() => leaderCandidates(membersQ.data ?? []), [membersQ.data]);
  const preachers = useMemo(() => preacherCandidates(membersQ.data ?? []), [membersQ.data]);

  const tableModel = useMemo(
    () =>
      buildSundayScheduleTableModel({
        periodStart: tablePeriodStart,
        plans: tablePlansQ.data ?? [],
        leaders,
        preachers,
      }),
    [tablePeriodStart, tablePlansQ.data, leaders, preachers],
  );

  const monthSundayPlans = useMemo(() => {
    return (plansQ.data ?? [])
      .filter((p) => isSameMonth(parseISO(p.service_date), month))
      .sort((a, b) => a.service_date.localeCompare(b.service_date));
  }, [plansQ.data, month]);

  function openPlan(plan: SundaySchedulePlan) {
    setSelectedPlan(plan);
    setLeaderId(plan.leader_member_id ?? '');
    setPreacherId(plan.preacher_member_id ?? '');
  }

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-3 sm:space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Расписание</h1>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug text-stone-500 sm:text-sm">
              Воскресное служение — ведущие и проповедники
            </p>
          </div>
          <Link
            to="/schedules/sunday/my"
            className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center gap-2 self-start rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm hover:bg-stone-50 active:bg-stone-100 sm:w-auto"
          >
            <LuCalendarDays className="h-4 w-4 shrink-0" aria-hidden />
            Моё расписание
          </Link>
        </header>

        <MinistryScheduleSwitcher
          role={role}
          ministryDirection={meQ.data?.ministry_direction}
          ministryRole={meQ.data?.ministry_role}
          roles={roles}
          active="sunday"
        />

        <UpcomingSundayServicesWidget
          plans={upcomingThree}
          loading={upcomingQ.isLoading}
          onSelect={openPlan}
        />

        <div
          className="flex w-full rounded-2xl border border-stone-200 bg-stone-100/90 p-1"
          role="tablist"
          aria-label="Вид расписания"
        >
          {(
            [
              ['calendar', 'Календарь'],
              ['table', 'Таблица'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={viewMode === id}
              onClick={() => setViewMode(id)}
              className={[
                'tap-highlight-transparent min-h-[44px] flex-1 rounded-[10px] px-2 text-[13px] font-extrabold transition-colors sm:min-h-[40px] sm:px-3 sm:text-sm',
                viewMode === id
                  ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200/90'
                  : 'text-stone-600 hover:text-stone-900',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {viewMode === 'table' ? (
          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[var(--shadow-card)] sm:p-4">
            <SundayScheduleTableView
              model={tableModel}
              loading={tablePlansQ.isLoading || membersQ.isLoading}
              onPrevPeriod={() => setTablePeriodStart((d) => addMonths(d, -1))}
              onNextPeriod={() => setTablePeriodStart((d) => addMonths(d, 1))}
              onTodayPeriod={() => setTablePeriodStart(startOfMonth(new Date()))}
            />
          </section>
        ) : (
          <>
        <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[var(--shadow-card)] sm:p-0">
          <div className="flex flex-col gap-3 border-b border-stone-100 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <p className="min-w-0 text-center text-[15px] font-extrabold capitalize leading-snug text-stone-900 sm:flex-1 sm:text-left sm:text-lg">
              {format(month, 'LLLL yyyy', { locale: ru })}
            </p>
            <div className="flex items-center justify-center gap-1.5 sm:shrink-0">
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, -1))}
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Предыдущий месяц"
              >
                <LuChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setMonth(startOfMonth(new Date()))}
                className="tap-highlight-transparent min-h-[44px] flex-1 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 px-4 text-sm font-extrabold text-primary hover:brightness-[1.02] active:brightness-[0.98] sm:flex-initial sm:px-3"
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => setMonth((m) => addMonths(m, 1))}
                className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-xl border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100"
                aria-label="Следующий месяц"
              >
                <LuChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-stone-100 bg-stone-50/90">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={[
                  'px-0.5 py-2 text-center text-[10px] font-extrabold uppercase tracking-wide sm:text-[11px]',
                  i === 6 ? 'text-primary' : 'text-stone-400',
                ].join(' ')}
              >
                {label}
              </div>
            ))}
          </div>

          {plansQ.isLoading ? (
            <div className="flex justify-center py-16 text-stone-500">
              <LuLoaderCircle className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <>
              {/* Мобильный компактный календарь */}
              <div className="grid grid-cols-7 gap-px bg-stone-100 lg:hidden">
                {calendarDays.map((day) => {
                  const inMonth = isSameMonth(day, month);
                  const today = isToday(day);
                  const sunday = isSunday(day);
                  const dateKey = ymd(day);
                  const plan = plansByDate.get(dateKey) ?? null;
                  const hasAssignments = Boolean(plan?.leader || plan?.preacher);
                  const clickable = sunday && plan;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={!clickable}
                      onClick={() => plan && openPlan(plan)}
                      className={[
                        'tap-highlight-transparent touch-manipulation flex min-h-[68px] flex-col items-center justify-start gap-0.5 bg-white p-1 active:bg-stone-50',
                        !inMonth ? 'opacity-35' : '',
                        today ? 'ring-1 ring-inset ring-primary/40 bg-primary/[0.03]' : '',
                        sunday && inMonth && !today ? 'bg-primary/[0.02]' : '',
                        !clickable ? 'cursor-default' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold',
                          today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-800',
                        ].join(' ')}
                      >
                        {format(day, 'd')}
                      </span>
                      {sunday && plan ? (
                        <div className="flex w-full flex-col items-center gap-0.5 px-0.5">
                          <span
                            className={[
                              'h-1.5 w-1.5 rounded-full',
                              hasAssignments ? 'bg-primary' : 'bg-amber-400',
                            ].join(' ')}
                            aria-hidden
                          />
                          <p className="w-full truncate text-center text-[8px] font-bold leading-tight text-stone-700">
                            {firstNameOnly(plan.leader?.name)}
                          </p>
                          <p className="w-full truncate text-center text-[8px] font-semibold leading-tight text-stone-500">
                            {firstNameOnly(plan.preacher?.name)}
                          </p>
                        </div>
                      ) : (
                        <span className="min-h-[6px]" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Десктоп: полная сетка с назначениями */}
              <div className="hidden grid-cols-7 gap-1 p-2 lg:grid">
                {calendarDays.map((day) => {
                  const inMonth = isSameMonth(day, month);
                  const today = isToday(day);
                  const sunday = isSunday(day);
                  const dateKey = ymd(day);
                  const plan = plansByDate.get(dateKey) ?? null;
                  const hasAssignments = Boolean(plan?.leader || plan?.preacher);

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={!sunday || !plan}
                      onClick={() => plan && openPlan(plan)}
                      className={[
                        'min-h-[88px] rounded-xl border p-2 text-left transition',
                        !inMonth ? 'opacity-40' : '',
                        sunday && plan
                          ? hasAssignments
                            ? 'border-primary/30 bg-primary/[0.04] hover:bg-primary/[0.08]'
                            : 'border-amber-200 bg-amber-50/50 hover:bg-amber-50'
                          : 'border-stone-100 bg-stone-50/50',
                        !sunday || !plan ? 'cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <div
                        className={[
                          'mb-1 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-lg px-1 text-xs font-bold',
                          today ? 'bg-primary text-white' : sunday ? 'text-primary' : 'text-stone-700',
                        ].join(' ')}
                      >
                        {format(day, 'd')}
                      </div>
                      {sunday && plan ? (
                        <div className="space-y-0.5 text-[11px] leading-tight">
                          <p className="truncate font-semibold text-stone-800">
                            {plan.leader?.name ?? 'Ведущий: —'}
                          </p>
                          <p className="truncate font-semibold text-stone-600">
                            {plan.preacher?.name ?? 'Проповедник: —'}
                          </p>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 px-3 py-2.5 text-[11px] font-semibold text-stone-500 sm:px-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" />
              Назначения есть
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Нужно назначить
            </span>
          </div>

          <p className="border-t border-stone-100 px-3 py-3 text-xs text-stone-500 sm:px-4">
            Назначения доступны только для дат, на которые уже создан план служения в разделе{' '}
            <Link to="/service-planner" className="font-semibold text-primary hover:underline">
              Служение
            </Link>
            .
          </p>
        </section>

        {/* Мобильный список воскресных служений */}
        <section className="space-y-2 lg:hidden">
          <h2 className="px-1 text-sm font-extrabold text-stone-800">
            Служения — {capitalizeRuMonthTitle(format(month, 'LLLL', { locale: ru }))}
          </h2>
          {monthSundayPlans.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center shadow-[var(--shadow-card)]">
              <p className="text-sm font-extrabold text-stone-700">Нет планов на этот месяц</p>
              <p className="mt-1 text-xs text-stone-500">
                Создайте план в разделе{' '}
                <Link to="/service-planner" className="font-semibold text-primary hover:underline">
                  Служение
                </Link>
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {monthSundayPlans.map((plan) => {
                const dt = parseISO(plan.service_date);
                const hasAssignments = Boolean(plan.leader || plan.preacher);
                return (
                  <li key={plan.id}>
                    <button
                      type="button"
                      onClick={() => openPlan(plan)}
                      className={[
                        'tap-highlight-transparent flex w-full items-start gap-3 rounded-2xl border p-3 text-left shadow-sm active:scale-[0.99]',
                        hasAssignments
                          ? 'border-primary/20 bg-gradient-to-br from-primary/[0.04] to-white'
                          : 'border-amber-100 bg-gradient-to-br from-amber-50/80 to-white',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'mt-1 h-10 w-1 shrink-0 rounded-full',
                          hasAssignments ? 'bg-primary' : 'bg-amber-400',
                        ].join(' ')}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-extrabold uppercase tracking-wide text-stone-500">
                          {format(dt, 'EEEE, d MMMM', { locale: ru })}
                        </p>
                        <p className="mt-0.5 font-extrabold text-stone-900">
                          {plan.template_name ?? 'Воскресное служение'}
                          {plan.start_time ? ` · ${plan.start_time}` : ''}
                        </p>
                        <div className="mt-2 space-y-1 text-xs font-semibold text-stone-600">
                          <p>Ведущий: {plan.leader?.name ?? '—'}</p>
                          <p>Проповедник: {plan.preacher?.name ?? '—'}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
          </>
        )}

        {selectedPlan ? (
          <div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sunday-plan-dialog-title"
            onClick={() => setSelectedPlan(null)}
          >
            <div
              className={[
                'relative z-[111] flex w-full max-w-lg flex-col overflow-hidden border border-stone-200 bg-white shadow-2xl',
                isMobile
                  ? 'max-h-[min(calc(100dvh-1rem),720px)] rounded-t-3xl'
                  : 'max-h-[90vh] rounded-2xl',
              ].join(' ')}
              onClick={(e) => e.stopPropagation()}
            >
              {isMobile ? <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-stone-200" /> : null}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-100 px-4 pb-3 pt-3 sm:pt-4">
                <div className="min-w-0">
                  <h3 id="sunday-plan-dialog-title" className="text-lg font-extrabold text-stone-900">
                    {formatRuDateLong(selectedPlan.service_date)}
                  </h3>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {selectedPlan.template_name ?? 'План служения'}
                    {selectedPlan.start_time ? ` · ${selectedPlan.start_time}` : ''}
                  </p>
                </div>
                {isMobile ? (
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="tap-highlight-transparent grid h-11 w-11 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-600"
                    aria-label="Закрыть"
                  >
                    <LuX className="h-5 w-5" />
                  </button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                <div className="space-y-3">
                  <div className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">
                      <LuUser className="h-3.5 w-3.5" />
                      Ведущий
                    </span>
                    {canManage ? (
                      <select
                        value={leaderId}
                        disabled={patchMut.isPending}
                        onChange={(e) => setLeaderId(e.target.value ? Number(e.target.value) : '')}
                        className="tap-highlight-transparent w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base font-semibold text-stone-900 disabled:opacity-60 sm:py-2.5 sm:text-sm"
                      >
                        <option value="">Не назначен</option>
                        {leaders.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className={readonlyFieldClass()}>{selectedPlan.leader?.name ?? 'Не назначен'}</p>
                    )}
                  </div>

                  <div className="block">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">
                      <LuUser className="h-3.5 w-3.5" />
                      Проповедник
                    </span>
                    {canManage ? (
                      <select
                        value={preacherId}
                        disabled={patchMut.isPending}
                        onChange={(e) => setPreacherId(e.target.value ? Number(e.target.value) : '')}
                        className="tap-highlight-transparent w-full rounded-xl border border-stone-200 bg-white px-3 py-3 text-base font-semibold text-stone-900 disabled:opacity-60 sm:py-2.5 sm:text-sm"
                      >
                        <option value="">Не назначен</option>
                        {preachers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className={readonlyFieldClass()}>{selectedPlan.preacher?.name ?? 'Не назначен'}</p>
                    )}
                  </div>

                  {!canManage ? (
                    <p className="text-sm text-stone-600">Редактирование доступно только пастору и администратору.</p>
                  ) : null}
                </div>
              </div>

              <div
                className={
                  isMobile
                    ? mobileSheetFooterClass()
                    : 'flex flex-wrap gap-2 border-t border-stone-100 px-4 py-4'
                }
              >
                {isMobile ? (
                  <div className="flex w-full flex-col gap-2">
                    {canManage ? (
                      <button
                        type="button"
                        disabled={patchMut.isPending}
                        onClick={() =>
                          patchMut.mutate({
                            planId: selectedPlan.id,
                            leader_member_id: leaderId === '' ? null : leaderId,
                            preacher_member_id: preacherId === '' ? null : preacherId,
                          })
                        }
                        className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {patchMut.isPending ? 'Сохранение…' : 'Сохранить'}
                      </button>
                    ) : null}
                    {patchMut.isError ? (
                      <p className="text-sm font-semibold text-rose-600">{apiErrorMessage(patchMut.error)}</p>
                    ) : null}
                    <Link
                      to="/service-planner"
                      state={{ openPlanId: selectedPlan.id }}
                      className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl border border-stone-200 px-4 text-sm font-bold text-stone-800 active:bg-stone-50"
                    >
                      <LuExternalLink className="h-4 w-4" />
                      Программа
                    </Link>
                    {!canManage ? (
                      <button
                        type="button"
                        onClick={() => setSelectedPlan(null)}
                        className="tap-highlight-transparent inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-stone-200 px-4 text-sm font-bold text-stone-700 active:bg-stone-50"
                      >
                        Закрыть
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {canManage ? (
                      <button
                        type="button"
                        disabled={patchMut.isPending}
                        onClick={() =>
                          patchMut.mutate({
                            planId: selectedPlan.id,
                            leader_member_id: leaderId === '' ? null : leaderId,
                            preacher_member_id: preacherId === '' ? null : preacherId,
                          })
                        }
                        className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {patchMut.isPending ? 'Сохранение…' : 'Сохранить'}
                      </button>
                    ) : (
                      <p className="text-sm text-stone-600">Редактирование доступно только пастору и администратору.</p>
                    )}
                    <Link
                      to="/service-planner"
                      state={{ openPlanId: selectedPlan.id }}
                      className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-800 hover:bg-stone-50"
                    >
                      <LuExternalLink className="h-4 w-4" />
                      Программа
                    </Link>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan(null)}
                      className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-stone-200 px-4 text-sm font-bold text-stone-700 hover:bg-stone-50"
                    >
                      Закрыть
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
