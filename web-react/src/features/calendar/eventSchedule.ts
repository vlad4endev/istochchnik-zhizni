import { format } from 'date-fns';

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

/** Одно вхождение события в календарной сетке (разовое или очередная неделя). */
export type CalendarOccurrence = {
  item: ChurchEventItem;
  startsAt: Date;
};

function applyLocalTimeOnDay(dayMidnight: Date, hhmm: string): Date {
  const raw = hhmm.trim() || '00:00';
  const [h, m] = raw.split(':').map((x) => Number(x) || 0);
  const d = new Date(dayMidnight);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Если событие попадает на указанный календарный день (локальное время), возвращает дату-время начала.
 * Для еженедельных событий сравнивается `weekly_day` с `Date#getDay()` (0 — вс, как в JS).
 */
export function occurrenceStartsAtOnLocalDay(day: Date, item: ChurchEventItem): Date | null {
  if (item.is_active === false) return null;
  const dayKey = format(day, 'yyyy-MM-dd');
  const timeStr = (item.event_time ?? '00:00').trim() || '00:00';

  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    if (day.getDay() !== weeklyDay) return null;
    const base = new Date(day);
    base.setHours(0, 0, 0, 0);
    return applyLocalTimeOnDay(base, timeStr);
  }

  if (item.event_date !== dayKey) return null;
  const ts = `${item.event_date}T${timeStr}:00`;
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Все вхождения из списка на один день, по времени начала. */
export function listOccurrencesOnLocalDay(day: Date, items: ChurchEventItem[]): CalendarOccurrence[] {
  const out: CalendarOccurrence[] = [];
  for (const item of items) {
    const startsAt = occurrenceStartsAtOnLocalDay(day, item);
    if (startsAt) out.push({ item, startsAt });
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}
