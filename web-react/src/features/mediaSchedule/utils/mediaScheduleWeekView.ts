import {
  format,
  isSameMonth,
  parseISO,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';

import type { MediaEvent } from '../types';

const WEEK_STARTS_ON = 1 as const;

export type WeekEventColumn = {
  dateKey: string;
  day: Date;
  event: MediaEvent;
};

function weekStartKey(d: Date): string {
  return format(startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }), 'yyyy-MM-dd');
}

export function buildNavigableWeekStarts(events: MediaEvent[]): Date[] {
  const seen = new Set<string>();
  const starts: Date[] = [];
  for (const ev of events) {
    const day = parseISO(ev.event_date);
    const key = weekStartKey(day);
    if (seen.has(key)) continue;
    seen.add(key);
    starts.push(startOfWeek(day, { weekStartsOn: WEEK_STARTS_ON }));
  }
  starts.sort((a, b) => a.getTime() - b.getTime());
  return starts;
}

export function findNavigableWeekIndex(weekStarts: Date[], cursor: Date): number {
  const currentKey = weekStartKey(cursor);
  const exact = weekStarts.findIndex((w) => format(w, 'yyyy-MM-dd') === currentKey);
  if (exact >= 0) return exact;

  const currentStart = startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }).getTime();
  const futureIdx = weekStarts.findIndex((w) => w.getTime() >= currentStart);
  if (futureIdx >= 0) return futureIdx;

  return weekStarts.length > 0 ? weekStarts.length - 1 : -1;
}

export function snapCursorToNearestServiceWeek(cursor: Date, weekStarts: Date[]): Date {
  if (weekStarts.length === 0) return cursor;
  const idx = findNavigableWeekIndex(weekStarts, cursor);
  return idx >= 0 ? weekStarts[idx]! : cursor;
}

export function getWeekDaysWithEvents(
  events: MediaEvent[],
  weekStart: Date,
  weekEnd: Date,
): Date[] {
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(weekEnd, 'yyyy-MM-dd');
  const dateKeys = new Set<string>();
  for (const ev of events) {
    if (ev.event_date >= from && ev.event_date <= to) dateKeys.add(ev.event_date);
  }
  return Array.from(dateKeys)
    .sort()
    .map((d) => parseISO(d));
}

export function buildWeekEventColumns(
  eventsByDate: Map<string, MediaEvent[]>,
  daysWithEvents: Date[],
): WeekEventColumn[] {
  const cols: WeekEventColumn[] = [];
  for (const day of daysWithEvents) {
    const key = format(day, 'yyyy-MM-dd');
    for (const event of eventsByDate.get(key) ?? []) {
      cols.push({ dateKey: key, day, event });
    }
  }
  return cols;
}

export function formatWeekViewHeader(daysWithEvents: Date[], weekStart: Date, weekEnd: Date): string {
  if (daysWithEvents.length === 0) {
    return `${format(weekStart, 'd', { locale: ru })}–${format(weekEnd, 'd MMMM yyyy', { locale: ru })}`;
  }
  if (daysWithEvents.length === 1) {
    const day = daysWithEvents[0]!;
    return format(day, 'd MMMM yyyy, EEEE', { locale: ru });
  }
  const first = daysWithEvents[0]!;
  const last = daysWithEvents[daysWithEvents.length - 1]!;
  if (isSameMonth(first, last)) {
    return `${format(first, 'd', { locale: ru })}–${format(last, 'd MMMM yyyy', { locale: ru })}`;
  }
  return `${format(first, 'd MMM', { locale: ru })} – ${format(last, 'd MMM yyyy', { locale: ru })}`;
}

export function weekHasEvents(events: MediaEvent[], weekStart: Date, weekEnd: Date): boolean {
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(weekEnd, 'yyyy-MM-dd');
  return events.some((ev) => ev.event_date >= from && ev.event_date <= to);
}
