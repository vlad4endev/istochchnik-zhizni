import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameMonth,
  isSunday,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { ru } from 'date-fns/locale';

import type { SundayScheduleMember, SundaySchedulePlan } from '../api/sundayScheduleApi';

export type SundayScheduleTableMonth = {
  key: string;
  label: string;
  sundayDaysLabel: string;
};

export type SundayScheduleTablePersonRow = {
  memberId: number;
  name: string;
  monthCells: string[];
};

export type SundayScheduleTableSection = {
  roleTitle: 'Ведущий:' | 'Проповедник:';
  monthHeaders: string[];
  rows: SundayScheduleTablePersonRow[];
};

export type SundayScheduleTableModel = {
  title: string;
  months: SundayScheduleTableMonth[];
  sections: SundayScheduleTableSection[];
};

function capitalizeRu(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sundayDayNumbersInMonth(monthStart: Date): number[] {
  const start = startOfMonth(monthStart);
  const end = endOfMonth(monthStart);
  return eachDayOfInterval({ start, end })
    .filter((d) => isSunday(d))
    .map((d) => d.getDate());
}

function formatDayList(days: number[]): string {
  if (days.length === 0) return '';
  return days.join(', ');
}

function assignmentDaysForMember(
  plans: SundaySchedulePlan[],
  memberId: number,
  role: 'leader' | 'preacher',
  monthStart: Date,
): number[] {
  return plans
    .filter((p) => isSameMonth(parseISO(p.service_date), monthStart))
    .filter((p) =>
      role === 'leader' ? p.leader_member_id === memberId : p.preacher_member_id === memberId,
    )
    .map((p) => parseISO(p.service_date).getDate())
    .sort((a, b) => a - b);
}

function buildPersonRows(
  members: SundayScheduleMember[],
  plans: SundaySchedulePlan[],
  monthStarts: Date[],
  role: 'leader' | 'preacher',
): SundayScheduleTablePersonRow[] {
  return members.map((member) => ({
    memberId: member.id,
    name: member.name,
    monthCells: monthStarts.map((monthStart) =>
      formatDayList(assignmentDaysForMember(plans, member.id, role, monthStart)),
    ),
  }));
}

export function threeMonthWindowStart(anchor: Date): Date[] {
  const start = startOfMonth(anchor);
  return [start, addMonths(start, 1), addMonths(start, 2)];
}

export function buildSundayScheduleTableModel(input: {
  periodStart: Date;
  plans: SundaySchedulePlan[];
  leaders: SundayScheduleMember[];
  preachers: SundayScheduleMember[];
}): SundayScheduleTableModel {
  const monthStarts = threeMonthWindowStart(input.periodStart);
  const months: SundayScheduleTableMonth[] = monthStarts.map((monthStart) => {
    const days = sundayDayNumbersInMonth(monthStart);
    return {
      key: format(monthStart, 'yyyy-MM'),
      label: capitalizeRu(format(monthStart, 'LLLL', { locale: ru })),
      sundayDaysLabel: formatDayList(days),
    };
  });

  const firstLabel = months[0]?.label ?? '';
  const lastLabel = months[2]?.label ?? months[1]?.label ?? '';
  const year = format(monthStarts[0] ?? input.periodStart, 'yyyy');
  const title = `График на ${firstLabel.toLowerCase()} — ${lastLabel.toLowerCase()} ${year} года`;

  const monthHeaders = months.map((m) => m.sundayDaysLabel);

  return {
    title,
    months,
    sections: [
      {
        roleTitle: 'Ведущий:',
        monthHeaders,
        rows: buildPersonRows(input.leaders, input.plans, monthStarts, 'leader'),
      },
      {
        roleTitle: 'Проповедник:',
        monthHeaders,
        rows: buildPersonRows(input.preachers, input.plans, monthStarts, 'preacher'),
      },
    ],
  };
}

export function tableRangeYmd(periodStart: Date): { from: string; to: string } {
  const monthStarts = threeMonthWindowStart(periodStart);
  const from = format(monthStarts[0]!, 'yyyy-MM-dd');
  const to = format(endOfMonth(monthStarts[2]!), 'yyyy-MM-dd');
  return { from, to };
}
