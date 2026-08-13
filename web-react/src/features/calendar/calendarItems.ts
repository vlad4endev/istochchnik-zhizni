import type { ChurchEventItem, ChurchEventOccurrenceOverride } from './api';
import type { CalendarOccurrence } from './eventSchedule';
import { listOccurrencesOnLocalDay } from './eventSchedule';
import type { CalendarSundayService } from './sundayServiceTypes';

export type CalendarGridEventItem = {
  kind: 'event';
  key: string;
  startsAt: Date;
  occurrenceDateKey: string;
  occurrence: CalendarOccurrence;
};

export type CalendarGridSundayItem = {
  kind: 'sunday';
  key: string;
  startsAt: Date;
  occurrenceDateKey: string;
  service: CalendarSundayService;
};

export type CalendarGridItem = CalendarGridEventItem | CalendarGridSundayItem;

function applyLocalTimeOnDay(dayMidnight: Date, hhmm: string): Date {
  const raw = hhmm.trim() || '10:00';
  const [h, m] = raw.split(':').map((x) => Number(x) || 0);
  const d = new Date(dayMidnight);
  d.setHours(h, m, 0, 0);
  return d;
}

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

/** Еженедельное/разовое событие, которое дублирует карточку воскресного служения. */
export function isGenericSundayWorshipEvent(item: ChurchEventItem): boolean {
  const title = normalizeTitle(item.title ?? '');
  if (!title) return false;
  return /воскресн/.test(title) || /богослужен/.test(title);
}

export function sundayServiceStartsAt(day: Date, service: CalendarSundayService): Date {
  const base = new Date(day);
  base.setHours(0, 0, 0, 0);
  return applyLocalTimeOnDay(base, service.start_time || '10:00');
}

export function servicesOnLocalDay(
  dayKey: string,
  services: CalendarSundayService[],
): CalendarSundayService[] {
  return services.filter((s) => s.service_date === dayKey);
}

export function listCalendarItemsOnLocalDay(
  day: Date,
  items: ChurchEventItem[],
  overrides: ChurchEventOccurrenceOverride[] | undefined,
  services: CalendarSundayService[],
  dayKey: string,
): CalendarGridItem[] {
  const sundayRows = servicesOnLocalDay(dayKey, services);
  const hasSundayService = sundayRows.length > 0;
  const events = listOccurrencesOnLocalDay(day, items, overrides).filter((occ) => {
    if (!hasSundayService) return true;
    if (day.getDay() !== 0) return true;
    return !isGenericSundayWorshipEvent(occ.item);
  });

  const out: CalendarGridItem[] = [];
  for (const service of sundayRows) {
    const startsAt = sundayServiceStartsAt(day, service);
    out.push({
      kind: 'sunday',
      key: `sunday-${service.id || service.service_date}-${startsAt.getTime()}`,
      startsAt,
      occurrenceDateKey: dayKey,
      service,
    });
  }
  for (const occurrence of events) {
    out.push({
      kind: 'event',
      key: `event-${occurrence.item.id}-${occurrence.startsAt.getTime()}`,
      startsAt: occurrence.startsAt,
      occurrenceDateKey: occurrence.occurrenceDateKey,
      occurrence,
    });
  }
  out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return out;
}

export function upcomingSundayServices(
  services: CalendarSundayService[],
  todayKey: string,
  limit = 3,
): CalendarSundayService[] {
  return [...services]
    .filter((s) => s.service_date >= todayKey)
    .sort((a, b) => a.service_date.localeCompare(b.service_date) || a.start_time.localeCompare(b.start_time))
    .slice(0, limit);
}

export function sundayServiceSubtitle(service: CalendarSundayService): string {
  const parts: string[] = [];
  if (service.sermon_topic?.trim()) parts.push(service.sermon_topic.trim());
  else if (service.leader?.name) parts.push(`Ведущий: ${service.leader.name}`);
  return parts[0] ?? '';
}
