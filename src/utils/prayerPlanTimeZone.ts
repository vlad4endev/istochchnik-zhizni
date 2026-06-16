import { formatYmdInTimeZone } from './zonedTime';

/** Таймзона церкви для молитвенного цикла и недели пн–вс (как в calendarService). */
export function resolvePrayerPlanWeekTimeZone(): string {
  const candidates = [process.env.PRAYER_PLAN_WEEK_TZ, process.env.CURATOR_DISTRIBUTION_TZ];
  for (const raw of candidates) {
    const tz = raw?.trim();
    if (!tz) continue;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      // ignore invalid TZ
    }
  }
  return 'Europe/Moscow';
}

/** «Сегодня» для молитвенного цикла в календаре церкви (YYYY-MM-DD). */
export function getPrayerCycleTodayYmd(): string {
  return formatYmdInTimeZone(resolvePrayerPlanWeekTimeZone(), new Date());
}
