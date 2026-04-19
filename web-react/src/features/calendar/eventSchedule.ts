import type { ChurchEventItem } from './api';

function parseOnceEventDateTime(item: ChurchEventItem): Date | null {
  const ts = `${item.event_date}T${item.event_time}:00`;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextWeeklyDate(now: Date, weeklyDay: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  const base = new Date(now);
  const diff = (weeklyDay - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  base.setHours(h, m, 0, 0);
  if (base.getTime() < now.getTime()) {
    base.setDate(base.getDate() + 7);
  }
  return base;
}

/** Ближайшее по времени вхождение события (разовое или еженедельное). */
export function eventNextOccurrence(now: Date, item: ChurchEventItem): Date | null {
  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    return nextWeeklyDate(now, weeklyDay, item.event_time);
  }
  return parseOnceEventDateTime(item);
}

/**
 * Сколько активных событий имеют ближайшее вхождение в интервале [now, now + windowDays]
 * (по локальному времени, конец окна — конец последнего дня).
 */
export function countUpcomingEventsInWindow(
  now: Date,
  items: ChurchEventItem[],
  windowDays: number,
): number {
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + windowDays);
  windowEnd.setHours(23, 59, 59, 999);
  let n = 0;
  for (const item of items) {
    if (item.is_active === false) continue;
    const dt = eventNextOccurrence(now, item);
    if (!dt) continue;
    if (dt.getTime() >= now.getTime() && dt.getTime() <= windowEnd.getTime()) {
      n++;
    }
  }
  return n;
}
