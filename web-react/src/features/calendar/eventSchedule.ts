import { format } from 'date-fns';

import type { ChurchEventItem, ChurchEventOccurrenceOverride } from './api';

function effectiveActiveFromYmd(item: ChurchEventItem): string {
  const raw = item.active_from?.trim();
  if (raw && raw.length >= 10) return raw.slice(0, 10);
  return item.event_date.slice(0, 10);
}

function dayWithinActiveRange(dayKey: string, item: ChurchEventItem): boolean {
  const from = effectiveActiveFromYmd(item);
  if (dayKey.localeCompare(from) < 0) return false;
  const toRaw = item.active_to?.trim();
  if (toRaw && toRaw.length >= 10) {
    const to = toRaw.slice(0, 10);
    if (dayKey.localeCompare(to) > 0) return false;
  }
  return true;
}

/** Июнь, июль, август — локальный месяц (перерыв «летнее время» для еженедельных). */
function isNorthernSummerMonth(d: Date): boolean {
  const m = d.getMonth();
  return m === 5 || m === 6 || m === 7;
}

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

function advanceWeeklyUntilVisible(dt: Date, item: ChurchEventItem, maxSteps = 64): Date | null {
  let cur = new Date(dt);
  for (let i = 0; i < maxSteps; i++) {
    const key = format(cur, 'yyyy-MM-dd');
    if (!dayWithinActiveRange(key, item)) {
      const toRaw = item.active_to?.trim();
      if (toRaw && toRaw.length >= 10 && key.localeCompare(toRaw.slice(0, 10)) > 0) {
        return null;
      }
      cur.setDate(cur.getDate() + 7);
      continue;
    }
    if (item.skip_summer_break && isNorthernSummerMonth(cur)) {
      cur.setDate(cur.getDate() + 7);
      continue;
    }
    return cur;
  }
  return null;
}

/** Ближайшее по времени вхождение события (разовое или еженедельное). */
export function eventNextOccurrence(now: Date, item: ChurchEventItem): Date | null {
  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    const candidate = nextWeeklyDate(now, weeklyDay, item.event_time);
    return advanceWeeklyUntilVisible(candidate, item);
  }
  const once = parseOnceEventDateTime(item);
  if (!once) return null;
  const key = format(once, 'yyyy-MM-dd');
  if (!dayWithinActiveRange(key, item)) return null;
  return once;
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
  /** Локальный календарный день вхождения, `yyyy-MM-dd`. */
  occurrenceDateKey: string;
};

function mergeItemWithOccurrenceOverride(
  item: ChurchEventItem,
  ov: ChurchEventOccurrenceOverride,
): ChurchEventItem {
  return {
    ...item,
    title: ov.title != null && ov.title.trim() !== '' ? ov.title.trim() : item.title,
    description: ov.description !== null ? ov.description : item.description,
    event_time:
      ov.event_time != null && ov.event_time.trim() !== '' ? ov.event_time.trim() : item.event_time,
    poster_url:
      ov.poster_url != null && String(ov.poster_url).trim() !== ''
        ? String(ov.poster_url).trim()
        : item.poster_url,
  };
}

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
  if (!dayWithinActiveRange(dayKey, item)) return null;
  const timeStr = (item.event_time ?? '00:00').trim() || '00:00';

  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    if (day.getDay() !== weeklyDay) return null;
    if (item.skip_summer_break && isNorthernSummerMonth(day)) return null;
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
export function listOccurrencesOnLocalDay(
  day: Date,
  items: ChurchEventItem[],
  overrides?: ChurchEventOccurrenceOverride[],
): CalendarOccurrence[] {
  const dayKey = format(day, 'yyyy-MM-dd');
  const byEventId = new Map<number, ChurchEventOccurrenceOverride>();
  if (overrides?.length) {
    for (const o of overrides) {
      const od = o.occurrence_date.trim().slice(0, 10);
      if (od === dayKey) byEventId.set(o.event_id, o);
    }
  }

  const out: CalendarOccurrence[] = [];
  for (const item of items) {
    const ov = item.recurrence_type === 'weekly' ? byEventId.get(item.id) : undefined;
    if (ov?.is_hidden) continue;
    const merged = ov ? mergeItemWithOccurrenceOverride(item, ov) : item;
    const startsAt = occurrenceStartsAtOnLocalDay(day, merged);
    if (startsAt) out.push({ item: merged, startsAt, occurrenceDateKey: dayKey });
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}
