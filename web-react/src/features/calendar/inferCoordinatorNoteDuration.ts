import { format, parse } from 'date-fns';

import type { DashboardCoordinatorDuration } from './api';

function sundayOfCalendarWeekContaining(d: Date): Date {
  const day = d.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysFromMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/** Подбирает пресет срока по сохранённым датам (как на сервере при сохранении). */
export function inferCoordinatorNoteDuration(
  startYmd: string,
  endYmd: string,
): DashboardCoordinatorDuration {
  if (startYmd === endYmd) return 'day';
  const d = parse(startYmd, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return 'day';
  const weekEnd = format(sundayOfCalendarWeekContaining(d), 'yyyy-MM-dd');
  if (weekEnd === endYmd) return 'week';
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const monthEnd = format(lastDay, 'yyyy-MM-dd');
  if (monthEnd === endYmd) return 'month';
  return 'day';
}
