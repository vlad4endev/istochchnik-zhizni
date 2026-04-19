const WEEKDAY_FROM_EN_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedNow = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekDay: number;
};

/**
 * Календарные часы в указанной IANA-таймзоне (для сопоставления с расписанием уведомлений).
 */
/**
 * Календарная дата `YYYY-MM-DD` в указанной таймзоне для момента `date` (как на стенных часах церкви).
 */
export function formatYmdInTimeZone(timeZone: string, date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * UTC-момент внутри заданного календарного дня в `timeZone` (якорь для арифметики дней с учётом DST).
 */
export function zonedCalendarNoonUtc(timeZone: string, ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new Error(`Invalid YMD: ${ymd}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let t = Date.UTC(y, mo - 1, d, 12, 0, 0);
  for (let i = 0; i < 48; i += 1) {
    if (formatYmdInTimeZone(timeZone, new Date(t)) === ymd) {
      return new Date(t);
    }
    const got = formatYmdInTimeZone(timeZone, new Date(t));
    t += (got < ymd ? 1 : -1) * 3600 * 1000;
  }
  throw new Error(`Could not resolve calendar day ${ymd} in ${timeZone}`);
}

/** Сдвиг на N календарных дней в таймзоне (N может быть отрицательным). */
export function addCalendarDaysYmd(timeZone: string, ymd: string, delta: number): string {
  if (delta === 0) {
    return ymd;
  }
  const dir = delta > 0 ? 1 : -1;
  let cur = zonedCalendarNoonUtc(timeZone, ymd);
  let last = formatYmdInTimeZone(timeZone, cur);
  let remaining = Math.abs(delta);
  while (remaining > 0) {
    cur = new Date(cur.getTime() + dir * 3600 * 1000);
    const g = formatYmdInTimeZone(timeZone, cur);
    if (g !== last) {
      remaining -= 1;
      last = g;
    }
  }
  return formatYmdInTimeZone(timeZone, cur);
}

export function getZonedNow(timeZone: string, date: Date = new Date()): ZonedNow {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = dtf.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let wds = '';
  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'hour') hour = Number(p.value);
    else if (p.type === 'minute') minute = Number(p.value);
    else if (p.type === 'weekday') wds = p.value;
  }
  const key = wds.slice(0, 3) as keyof typeof WEEKDAY_FROM_EN_SHORT;
  const weekDay = WEEKDAY_FROM_EN_SHORT[key] ?? 0;
  return { year, month, day, hour, minute, weekDay };
}

export function parseHm(time: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** ISO-неделя для григорианской даты (год/месяц/день). */
export function isoWeekKeyFromYmd(year: number, month: number, day: number): string {
  const t = new Date(Date.UTC(year, month - 1, day));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
