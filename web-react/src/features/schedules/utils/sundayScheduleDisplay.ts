import { format, isBefore, parseISO, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';

import type { SundaySchedulePlan } from '../api/sundayScheduleApi';

export type SundayMyRole = 'Ведущий' | 'Проповедник';

export function serviceTitle(plan: SundaySchedulePlan): string {
  const name = plan.template_name?.trim();
  return name || 'Собрание';
}

export function mySundayRole(
  plan: SundaySchedulePlan,
  memberId: number | null | undefined,
): SundayMyRole | null {
  if (memberId == null) return null;
  if (plan.leader_member_id === memberId) return 'Ведущий';
  if (plan.preacher_member_id === memberId) return 'Проповедник';
  return null;
}

export function upcomingSundayPlans(plans: SundaySchedulePlan[], limit = 3): SundaySchedulePlan[] {
  const today = startOfDay(new Date());
  return plans
    .filter((p) => !isBefore(parseISO(p.service_date), today))
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
    .slice(0, limit);
}

export function formatSundayDateShort(dateIso: string): string {
  const dt = parseISO(dateIso);
  if (Number.isNaN(dt.getTime())) return dateIso;
  return format(dt, 'd MMMM', { locale: ru });
}

export function formatSundayDateWeekday(dateIso: string): string {
  const dt = parseISO(dateIso);
  if (Number.isNaN(dt.getTime())) return '';
  return format(dt, 'EEEE', { locale: ru });
}

export function formatSundayDayNumber(dateIso: string): string {
  const dt = parseISO(dateIso);
  if (Number.isNaN(dt.getTime())) return '—';
  return format(dt, 'd');
}

export function formatSundayMonthShort(dateIso: string): string {
  const dt = parseISO(dateIso);
  if (Number.isNaN(dt.getTime())) return '';
  return format(dt, 'MMM', { locale: ru });
}

export function firstNameOnly(fullName: string | null | undefined): string {
  const s = String(fullName ?? '').trim();
  if (!s) return '—';
  return s.split(/\s+/)[0] ?? s;
}

export function plansByServiceDate(plans: SundaySchedulePlan[]): Map<string, SundaySchedulePlan> {
  const map = new Map<string, SundaySchedulePlan>();
  for (const p of plans) map.set(p.service_date, p);
  return map;
}
