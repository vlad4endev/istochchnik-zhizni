import { format } from 'date-fns';

import type { ChurchEventItem, ChurchEventOccurrenceOverride } from '../api/events';

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

function isNorthernSummerMonth(d: Date): boolean {
  const m = d.getMonth();
  return m === 5 || m === 6 || m === 7;
}

function applyLocalTimeOnDay(dayMidnight: Date, hhmm: string): Date {
  const raw = hhmm.trim() || '00:00';
  const [h, m] = raw.split(':').map((x) => Number(x) || 0);
  const d = new Date(dayMidnight);
  d.setHours(h, m, 0, 0);
  return d;
}

export type CalendarOccurrence = {
  item: ChurchEventItem;
  startsAt: Date;
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
      ov.event_time != null && ov.event_time.trim() !== ''
        ? ov.event_time.trim()
        : item.event_time,
    poster_url:
      ov.poster_url != null && String(ov.poster_url).trim() !== ''
        ? String(ov.poster_url).trim()
        : item.poster_url,
  };
}

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

export type GroupedOccurrences = {
  dayKey: string;
  day: Date;
  items: CalendarOccurrence[];
};

/** Ближайшие вхождения на `days` календарных дней вперёд, сгруппированные по дню. */
export function listUpcomingOccurrencesGrouped(
  items: ChurchEventItem[],
  overrides: ChurchEventOccurrenceOverride[] | undefined,
  days = 42,
  from: Date = new Date(),
): GroupedOccurrences[] {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const groups: GroupedOccurrences[] = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const dayItems = listOccurrencesOnLocalDay(day, items, overrides);
    if (dayItems.length === 0) continue;
    groups.push({
      dayKey: format(day, 'yyyy-MM-dd'),
      day,
      items: dayItems,
    });
  }

  return groups;
}

/** Ближайшее предстоящее событие (не в прошлом относительно `from`). */
export function pickFirstUpcomingOccurrence(
  items: ChurchEventItem[],
  overrides: ChurchEventOccurrenceOverride[] | undefined,
  from: Date = new Date(),
): CalendarOccurrence | null {
  const groups = listUpcomingOccurrencesGrouped(items, overrides, 42, from);
  const nowMs = from.getTime();
  for (const g of groups) {
    for (const occ of g.items) {
      if (occ.startsAt.getTime() >= nowMs) return occ;
    }
  }
  return null;
}

export function uniqueEventCategories(items: ChurchEventItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const c = item.category?.trim();
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'));
}
