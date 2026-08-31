const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDateToUtc(dateValue: string): Date {
  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    throw new Error('Invalid date format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error('Invalid date value');
  }

  return utcDate;
}

export function getDiffDays(targetDate: string, startDate: string): number {
  const start = parseIsoDateToUtc(startDate);
  const target = parseIsoDateToUtc(targetDate);
  const diffTime = target.getTime() - start.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

/** 0 = воскресенье … 6 = суббота (UTC-календарь, как в JS getUTCDay / PostgreSQL DOW). */
export function getUtcDayOfWeek(isoDate: string): number {
  return parseIsoDateToUtc(isoDate).getUTCDay();
}

/** 0 = понедельник … 6 = воскресенье (ISO-неделя, как PostgreSQL ISODOW − 1). */
export function getMondayBasedDayIndex(isoDate: string): number {
  const dow = getUtcDayOfWeek(isoDate);
  return dow === 0 ? 6 : dow - 1;
}

/**
 * Позиция дня в молитвенном цикле относительно якоря `startDate`.
 * День старта = индекс 0 в очереди, следующий календарный день = +1, и так по кругу.
 */
export function getPrayerCyclePosition(targetDate: string, startDate: string): number {
  return getDiffDays(targetDate, startDate);
}

export function dayIndexInCycle(cyclePosition: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return ((cyclePosition % memberCount) + memberCount) % memberCount;
}

/**
 * start_date, при котором на anchorDate очередь приходится на rosterIndex (0..memberCount-1),
 * при сохранении порядка списка (обычно А–Я).
 */
export function computePrayerCycleAnchorStartDate(
  anchorDate: string,
  rosterIndex: number,
  memberCount: number,
): string {
  if (memberCount <= 0) {
    return anchorDate;
  }
  const targetIndex = dayIndexInCycle(rosterIndex, memberCount);
  return addUtcDaysToIsoDate(anchorDate, -targetIndex);
}

export function addUtcDaysToIsoDate(isoDate: string, deltaDays: number): string {
  const d = parseIsoDateToUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
