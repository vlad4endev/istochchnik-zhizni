import {
  getCurrentWeekDates,
  getMemberAssignmentsForWeek,
  getNextWeekDates,
  type WeekPlanKind,
} from './calendarService';
import { DistributionService, type CuratorWeekAssignment } from './DistributionService';

export type CycleDayInfo = {
  dateYmd: string;
  weekdayRu: string;
  dateLong: string;
  dateShort: string;
  memberId: number;
  memberName: string;
};

export type CoordinatorWeekTemplateContext = {
  weekKind: WeekPlanKind;
  weekLabel: string;
  weekFromYmd: string;
  weekToYmd: string;
  weekFrom: string;
  weekTo: string;
  weekRange: string;
  cycleIndex: number | null;
  dayByMemberId: Map<number, CycleDayInfo>;
  allDays: CycleDayInfo[];
  assignments: CuratorWeekAssignment[];
};

function capitalizeRu(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «28 июля» / «Понедельник, 28 июля» */
export function formatCoordinatorDateRu(
  dateYmd: string,
  style: 'short' | 'long' | 'weekday' = 'long',
): string {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return dateYmd;
  if (style === 'weekday') {
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'UTC' }).format(d);
  }
  if (style === 'short') {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(d);
  }
  const formatted = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  return capitalizeRu(formatted);
}

function memberDisplayName(member: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  id: number;
}): string {
  const full = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();
  if (full) return full;
  const n = (member.name ?? '').trim();
  if (n) return n;
  return `Участник ${member.id}`;
}

function jsWeekDayFromYmd(dateYmd: string): number {
  const d = new Date(`${dateYmd}T12:00:00.000Z`);
  return d.getUTCDay();
}

export async function loadCoordinatorWeekTemplateContext(
  weekKind: WeekPlanKind,
): Promise<CoordinatorWeekTemplateContext> {
  const dates = weekKind === 'next' ? getNextWeekDates() : getCurrentWeekDates();
  const weekFromYmd = dates[0] ?? '';
  const weekToYmd = dates[dates.length - 1] ?? weekFromYmd;
  const [dayAssignments, assignments] = await Promise.all([
    getMemberAssignmentsForWeek(weekKind),
    new DistributionService().getCoordinatorAssignmentsForQueueWeek(weekKind),
  ]);

  const dayByMemberId = new Map<number, CycleDayInfo>();
  const allDays: CycleDayInfo[] = [];
  for (const item of dayAssignments) {
    if (!item.member) continue;
    const info: CycleDayInfo = {
      dateYmd: item.date,
      weekdayRu: formatCoordinatorDateRu(item.date, 'weekday'),
      dateLong: formatCoordinatorDateRu(item.date, 'long'),
      dateShort: formatCoordinatorDateRu(item.date, 'short'),
      memberId: item.member.id,
      memberName: memberDisplayName(item.member),
    };
    allDays.push(info);
    dayByMemberId.set(item.member.id, info);
  }

  const cycleIndex = assignments[0]?.cycleIndex ?? null;

  return {
    weekKind,
    weekLabel: weekKind === 'current' ? 'эту' : 'следующую',
    weekFromYmd,
    weekToYmd,
    weekFrom: formatCoordinatorDateRu(weekFromYmd, 'short'),
    weekTo: formatCoordinatorDateRu(weekToYmd, 'short'),
    weekRange: `${formatCoordinatorDateRu(weekFromYmd, 'short')} — ${formatCoordinatorDateRu(weekToYmd, 'short')}`,
    cycleIndex,
    dayByMemberId,
    allDays,
    assignments,
  };
}

function participantsWithDatesLines(
  members: Array<{ memberId: number; memberName: string }>,
  dayByMemberId: Map<number, CycleDayInfo>,
): string {
  if (members.length === 0) return 'нет участников';
  return members
    .map((m) => {
      const day = dayByMemberId.get(m.memberId);
      if (!day) return `• ${m.memberName}`;
      return `• ${m.memberName} — ${capitalizeRu(day.weekdayRu)}, ${day.dateShort}`;
    })
    .join('\n');
}

function cycleScheduleLines(
  members: Array<{ memberId: number; memberName: string }>,
  dayByMemberId: Map<number, CycleDayInfo>,
): string {
  const lines: string[] = [];
  for (const m of members) {
    const day = dayByMemberId.get(m.memberId);
    if (!day) continue;
    lines.push(`${capitalizeRu(day.weekdayRu)}, ${day.dateShort}: ${m.memberName}`);
  }
  return lines.length > 0 ? lines.join('\n') : 'нет дней в цикле на этой неделе';
}

function assignmentsBlock(ctx: CoordinatorWeekTemplateContext): string {
  if (ctx.assignments.length === 0) return 'Назначений пока нет.';
  const parts: string[] = [];
  for (const row of ctx.assignments) {
    parts.push(`${row.coordinatorName}:`);
    if (row.members.length === 0) {
      parts.push('  — нет участников');
    } else {
      for (const m of row.members) {
        const day = ctx.dayByMemberId.get(m.memberId);
        if (day) {
          parts.push(`  • ${m.memberName} — ${capitalizeRu(day.weekdayRu)}, ${day.dateShort}`);
        } else {
          parts.push(`  • ${m.memberName}`);
        }
      }
    }
    parts.push('');
  }
  return parts.join('\n').trim();
}

/** Базовые поля недели (общие для всех сценариев). */
export function baseWeekVars(ctx: CoordinatorWeekTemplateContext): Record<string, string> {
  return {
    week_kind: ctx.weekKind,
    week_label: ctx.weekLabel,
    week_from: ctx.weekFrom,
    week_to: ctx.weekTo,
    week_from_ymd: ctx.weekFromYmd,
    week_to_ymd: ctx.weekToYmd,
    week_range: ctx.weekRange,
    cycle_index: ctx.cycleIndex != null ? String(ctx.cycleIndex) : '',
    all_participants: ctx.allDays.map((d) => d.memberName).join(', ') || 'нет',
    all_coordinators:
      ctx.assignments.map((a) => a.coordinatorName).join(', ') || 'не назначены',
    assignments_block: assignmentsBlock(ctx),
    cycle_week_schedule: ctx.allDays
      .map((d) => `${capitalizeRu(d.weekdayRu)}, ${d.dateShort}: ${d.memberName}`)
      .join('\n') || 'нет дней',
  };
}

/** Персональные поля координатора (назначения / недельный дайджест в личку). */
export function coordinatorPersonalVars(
  ctx: CoordinatorWeekTemplateContext,
  row: CuratorWeekAssignment,
  extra?: Record<string, string>,
): Record<string, string> {
  const names = row.members.map((m) => m.memberName);
  return {
    ...baseWeekVars(ctx),
    coordinator_name: row.coordinatorName,
    participants: names.join(', ') || 'нет',
    participants_list:
      names.length > 0 ? names.map((n) => `• ${n}`).join('\n') : '• нет участников',
    participants_count: String(row.members.length),
    participants_with_dates: participantsWithDatesLines(row.members, ctx.dayByMemberId),
    cycle_schedule: cycleScheduleLines(row.members, ctx.dayByMemberId),
    ...(extra ?? {}),
  };
}

/** Поля для напоминания о пустой нужде. */
export function missingNeedVars(args: {
  title: string;
  memberName: string;
  dateYmd: string;
  coordinatorName: string;
  cycleIndex: number | null;
  weekKind?: WeekPlanKind;
}): Record<string, string> {
  const weekday = formatCoordinatorDateRu(args.dateYmd, 'weekday');
  const weekKind = args.weekKind ?? 'current';
  const dates = weekKind === 'next' ? getNextWeekDates() : getCurrentWeekDates();
  const weekFromYmd = dates[0] ?? args.dateYmd;
  const weekToYmd = dates[dates.length - 1] ?? args.dateYmd;
  return {
    title: args.title,
    member_name: args.memberName,
    date: args.dateYmd,
    date_long: formatCoordinatorDateRu(args.dateYmd, 'long'),
    date_short: formatCoordinatorDateRu(args.dateYmd, 'short'),
    weekday,
    weekday_cap: capitalizeRu(weekday),
    coordinator_name: args.coordinatorName || 'не назначен',
    cycle_index: args.cycleIndex != null ? String(args.cycleIndex) : '',
    week_kind: weekKind,
    week_label: weekKind === 'current' ? 'эту' : 'следующую',
    week_from: formatCoordinatorDateRu(weekFromYmd, 'short'),
    week_to: formatCoordinatorDateRu(weekToYmd, 'short'),
    week_range: `${formatCoordinatorDateRu(weekFromYmd, 'short')} — ${formatCoordinatorDateRu(weekToYmd, 'short')}`,
    week_day_js: String(jsWeekDayFromYmd(args.dateYmd)),
  };
}

/** Поля для одного назначения (пастор назначил участника). */
export function singleAssignmentVars(args: {
  title: string;
  body: string;
  actor: string;
  coordinatorName: string;
  memberName: string;
  memberId: number | null;
  ctx: CoordinatorWeekTemplateContext;
}): Record<string, string> {
  const day =
    args.memberId != null ? args.ctx.dayByMemberId.get(args.memberId) ?? null : null;
  const row = args.ctx.assignments.find(
    (a) => a.coordinatorName === args.coordinatorName,
  );
  const personal = row
    ? coordinatorPersonalVars(args.ctx, row, {
        title: args.title,
        body: args.body,
        actor: args.actor,
        member_name: args.memberName,
      })
    : {
        ...baseWeekVars(args.ctx),
        coordinator_name: args.coordinatorName,
        title: args.title,
        body: args.body,
        actor: args.actor,
        member_name: args.memberName,
        participants: args.memberName,
        participants_list: `• ${args.memberName}`,
        participants_count: '1',
        participants_with_dates: day
          ? `• ${args.memberName} — ${capitalizeRu(day.weekdayRu)}, ${day.dateShort}`
          : `• ${args.memberName}`,
        cycle_schedule: day
          ? `${capitalizeRu(day.weekdayRu)}, ${day.dateShort}: ${args.memberName}`
          : '',
      };

  return {
    ...personal,
    member_name: args.memberName,
    member_cycle_date: day?.dateShort ?? '',
    member_cycle_date_ymd: day?.dateYmd ?? '',
    member_cycle_weekday: day ? capitalizeRu(day.weekdayRu) : '',
    member_cycle_date_long: day?.dateLong ?? '',
    actor: args.actor,
    title: args.title,
    body: args.body,
  };
}
