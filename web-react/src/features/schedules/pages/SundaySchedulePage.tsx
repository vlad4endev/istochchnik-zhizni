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
} from 'react-icons/lu';


import { useMe } from '../../../hooks/useMe';
import { useAuthStore } from '../../auth/authStore';
import {
  fetchSundayScheduleMembers,
  fetchSundaySchedulePlans,
  patchSundaySchedulePlan,
  type SundaySchedulePlan,
} from '../api/sundayScheduleApi';
import { MinistryScheduleSwitcher } from '../components/MinistryScheduleSwitcher';
import { canManageSundaySchedule } from '../ministryScheduleAccess';
import { memberHasMinistryRole as matchRole } from '../../mediaSchedule/ministryRoleMatch';

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

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
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const token = useAuthStore((s) => s.token);
  const meQ = useMe(Boolean(token));

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedPlan, setSelectedPlan] = useState<SundaySchedulePlan | null>(null);
  const [leaderId, setLeaderId] = useState<number | ''>('');
  const [preacherId, setPreacherId] = useState<number | ''>('');

  const rangeFrom = useMemo(() => ymd(startOfWeek(startOfMonth(month), { weekStartsOn: 1 })), [month]);
  const rangeTo = useMemo(() => ymd(endOfWeek(endOfMonth(month), { weekStartsOn: 1 })), [month]);

  const plansQ = useQuery({
    queryKey: ['sunday-schedule', 'plans', rangeFrom, rangeTo],
    queryFn: () => fetchSundaySchedulePlans({ from: rangeFrom, to: rangeTo }),
  });

  const membersQ = useQuery({
    queryKey: ['sunday-schedule', 'members'],
    queryFn: fetchSundayScheduleMembers,
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

  function openPlan(plan: SundaySchedulePlan) {
    setSelectedPlan(plan);
    setLeaderId(plan.leader_member_id ?? '');
    setPreacherId(plan.preacher_member_id ?? '');
  }

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pb-28 pt-3 sm:px-4 sm:pb-12 sm:pt-4 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-stone-900 sm:text-2xl">Расписание</h1>
            <p className="mt-0.5 text-[13px] font-semibold text-stone-500 sm:text-sm">
              Воскресное служение — ведущие и проповедники
            </p>
          </div>
          <Link
            to="/schedules/sunday/my"
            className="inline-flex min-h-[42px] items-center justify-center gap-2 self-start rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-bold text-stone-800 shadow-sm hover:bg-stone-50"
          >
            <LuCalendarDays className="h-4 w-4" />
            Моё расписание
          </Link>
        </div>

        <MinistryScheduleSwitcher
          role={role}
          ministryDirection={meQ.data?.ministry_direction}
          ministryRole={meQ.data?.ministry_role}
          roles={roles}
          active="sunday"
        />

        <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, -1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
              aria-label="Предыдущий месяц"
            >
              <LuChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-extrabold capitalize text-stone-900 sm:text-lg">
              {format(month, 'LLLL yyyy', { locale: ru })}
            </h2>
            <button
              type="button"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="grid h-10 w-10 place-items-center rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50"
              aria-label="Следующий месяц"
            >
              <LuChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1 text-center text-[11px] font-bold uppercase tracking-wide text-stone-400">
                {label}
              </div>
            ))}
          </div>

          {plansQ.isLoading ? (
            <div className="flex justify-center py-16 text-stone-500">
              <LuLoaderCircle className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
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
                      'min-h-[72px] rounded-xl border p-1.5 text-left transition sm:min-h-[88px] sm:p-2',
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
                      <div className="space-y-0.5 text-[10px] leading-tight sm:text-[11px]">
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
          )}

          <p className="mt-3 text-xs text-stone-500">
            Назначения доступны только для дат, на которые уже создан план служения в разделе{' '}
            <Link to="/service-planner" className="font-semibold text-primary hover:underline">
              Служение
            </Link>
            .
          </p>
        </section>

        {selectedPlan ? (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sunday-plan-dialog-title"
            onClick={() => setSelectedPlan(null)}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl border border-stone-200 bg-white p-4 shadow-xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="sunday-plan-dialog-title" className="text-lg font-extrabold text-stone-900">
                {formatRuDateLong(selectedPlan.service_date)}
              </h3>
              <p className="mt-0.5 text-sm text-stone-500">
                {selectedPlan.template_name ?? 'План служения'}
                {selectedPlan.start_time ? ` · ${selectedPlan.start_time}` : ''}
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">
                    <LuUser className="h-3.5 w-3.5" />
                    Ведущий
                  </span>
                  <select
                    value={leaderId}
                    disabled={!canManage || patchMut.isPending}
                    onChange={(e) => setLeaderId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 disabled:opacity-60"
                  >
                    <option value="">Не назначен</option>
                    {leaders.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-stone-500">
                    <LuUser className="h-3.5 w-3.5" />
                    Проповедник
                  </span>
                  <select
                    value={preacherId}
                    disabled={!canManage || patchMut.isPending}
                    onChange={(e) => setPreacherId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 disabled:opacity-60"
                  >
                    <option value="">Не назначен</option>
                    {preachers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                  <p className="text-sm text-stone-600">Редактирование доступно ведущим и координаторам.</p>
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
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
