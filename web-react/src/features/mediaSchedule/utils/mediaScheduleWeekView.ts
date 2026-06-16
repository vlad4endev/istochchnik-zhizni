import {
  format,
  isSameMonth,
  parseISO,
} from 'date-fns';
import { ru } from 'date-fns/locale';

import type { MediaEvent } from '../types';

/** Сколько собраний показывать колонками на одной странице. */
export const ASSEMBLY_PAGE_SIZE = 5;

export type WeekEventColumn = {
  dateKey: string;
  day: Date;
  event: MediaEvent;
};

export function sortMediaEventsChronologically(events: MediaEvent[]): MediaEvent[] {
  return [...events].sort(
    (a, b) =>
      a.event_date.localeCompare(b.event_date) ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.id - b.id,
  );
}

export function buildServiceEventColumns(events: MediaEvent[]): WeekEventColumn[] {
  return sortMediaEventsChronologically(events).map((ev) => ({
    dateKey: ev.event_date,
    day: parseISO(ev.event_date),
    event: ev,
  }));
}

export function paginateAssemblyColumns(
  columns: WeekEventColumn[],
  pageIndex: number,
  pageSize: number = ASSEMBLY_PAGE_SIZE,
): {
  page: WeekEventColumn[];
  pageIndex: number;
  pageCount: number;
  total: number;
} {
  if (columns.length === 0) {
    return { page: [], pageIndex: 0, pageCount: 0, total: 0 };
  }
  const pageCount = Math.ceil(columns.length / pageSize);
  const clampedIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const start = clampedIndex * pageSize;
  return {
    page: columns.slice(start, start + pageSize),
    pageIndex: clampedIndex,
    pageCount,
    total: columns.length,
  };
}

export function findAssemblyPageForDate(
  columns: WeekEventColumn[],
  date: Date,
  pageSize: number = ASSEMBLY_PAGE_SIZE,
): number {
  if (columns.length === 0) return 0;
  const target = format(date, 'yyyy-MM-dd');
  let idx = columns.findIndex((c) => c.dateKey >= target);
  if (idx < 0) idx = columns.length - 1;
  return Math.floor(idx / pageSize);
}

export function formatAssemblyViewHeader(columns: WeekEventColumn[], pageIndex: number, pageCount: number): string {
  if (columns.length === 0) return 'Нет собраний с программой';
  if (columns.length === 1) {
    const day = columns[0]!.day;
    return format(day, 'd MMMM yyyy, EEEE', { locale: ru });
  }
  const first = columns[0]!.day;
  const last = columns[columns.length - 1]!.day;
  const range =
    isSameMonth(first, last)
      ? `${format(first, 'd', { locale: ru })}–${format(last, 'd MMMM yyyy', { locale: ru })}`
      : `${format(first, 'd MMM', { locale: ru })} – ${format(last, 'd MMM yyyy', { locale: ru })}`;
  if (pageCount <= 1) return range;
  return `${range} · стр. ${pageIndex + 1} из ${pageCount}`;
}

/** @deprecated используйте buildServiceEventColumns */
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
