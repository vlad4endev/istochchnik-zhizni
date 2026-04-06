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
