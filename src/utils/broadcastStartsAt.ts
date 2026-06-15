const PLAIN_DATETIME =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?$/;

export const BROADCAST_CHURCH_TIMEZONE =
  process.env.BROADCAST_CHURCH_TZ?.trim() ||
  process.env.PRAYER_PLAN_WEEK_TZ?.trim() ||
  process.env.CURATOR_DISTRIBUTION_TZ?.trim() ||
  'Europe/Moscow';

/** Колонка для SELECT — без преобразования node-pg в Date (иначе +3 ч в JSON). */
export const BROADCAST_STARTS_AT_SELECT = `starts_at::text AS starts_at`;

function formatWallClockInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Сохраняем локальное «настенное» время церкви в TIMESTAMP WITHOUT TIME ZONE. */
export function normalizeBroadcastStartsAtForDb(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const plain = PLAIN_DATETIME.exec(raw);
  if (plain && !/[zZ]$/.test(raw) && !/[+-]\d{2}:?\d{2}$/.test(raw)) {
    const sec = (plain[3] ?? '00').padStart(2, '0');
    return `${plain[1]} ${plain[2]}:${sec}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatWallClockInTimeZone(parsed, BROADCAST_CHURCH_TIMEZONE);
}
