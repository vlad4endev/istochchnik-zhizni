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
 * Понедельник = 0 (первый в списке), вторник = 1, …, воскресенье = 6.
 * Полный проход по списку = один цикл; следующий день снова с начала списка.
 */
export function getPrayerCyclePosition(targetDate: string, startDate: string): number {
  return getDiffDays(targetDate, startDate) + getMondayBasedDayIndex(startDate);
}

export function dayIndexInCycle(cyclePosition: number, memberCount: number): number {
  if (memberCount <= 0) {
    return 0;
  }
  return ((cyclePosition % memberCount) + memberCount) % memberCount;
}

/**
 * start_date, при котором на anchorDate очередь приходится на rosterIndex (0..memberCount-1).
 *
 * Позиция зависит только от понедельника недели `start_date` (день внутри недели не влияет):
 * `position = daysSince(mondayOf(start))`. Поэтому перебор идёт по понедельникам назад.
 *
 * Возвращает `null`, если индекс недостижим (типично когда `memberCount` кратен 7:
 * в конкретный день недели доступен только один остаток по модулю).
 */
export function computePrayerCycleAnchorStartDate(
  anchorDate: string,
  rosterIndex: number,
  memberCount: number,
): string | null {
  if (memberCount <= 0) {
    return anchorDate;
  }
  const targetIndex = dayIndexInCycle(rosterIndex, memberCount);
  const anchorMonIdx = getMondayBasedDayIndex(anchorDate);
  // Monday M = anchor − anchorMonIdx − 7·w → position = anchorMonIdx + 7·w
  for (let w = 0; w <= memberCount; w++) {
    const position = anchorMonIdx + 7 * w;
    if (dayIndexInCycle(position, memberCount) === targetIndex) {
      return addUtcDaysToIsoDate(anchorDate, -(anchorMonIdx + 7 * w));
    }
  }
  return null;
}

/**
 * Порядок очереди: с `dayIndex` идёт `memberId`, далее — круговой хвост прежнего списка.
 * Нужен, когда сдвигом start_date нельзя выставить произвольный индекс «на сегодня».
 */
export function buildPrayerCycleOrderWithMemberOnDayIndex(
  mergedIds: readonly number[],
  memberId: number,
  dayIndex: number,
): number[] | null {
  const n = mergedIds.length;
  if (n <= 0) {
    return null;
  }
  const rosterIndex = mergedIds.indexOf(memberId);
  if (rosterIndex < 0) {
    return null;
  }
  const todayIdx = dayIndexInCycle(dayIndex, n);
  const fromSelected = [...mergedIds.slice(rosterIndex), ...mergedIds.slice(0, rosterIndex)];
  return Array.from({ length: n }, (_, i) => fromSelected[(i - todayIdx + n) % n]!);
}

export function addUtcDaysToIsoDate(isoDate: string, deltaDays: number): string {
  const d = parseIsoDateToUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
