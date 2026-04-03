const ACCESS_STORAGE_KEY = 'broadcast_dashboard_access_until';

function parseHm(hhmm: string): { hours: number; minutes: number } {
  const [h, m] = hhmm.split(':');
  return {
    hours: Number(h) || 0,
    minutes: Number(m) || 0,
  };
}

function withTime(base: Date, hhmm: string): Date {
  const { hours, minutes } = parseHm(hhmm);
  const next = new Date(base);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

export function isBroadcastLiveNow(now = new Date()): boolean {
  const isSunday = now.getDay() === 0;
  if (!isSunday) return false;
  const from = withTime(now, '10:30');
  const to = withTime(now, '13:00');
  return now >= from && now <= to;
}

export function extractBroadcastDateLabel(embedCode: string | null | undefined): string | null {
  const code = String(embedCode ?? '').trim();
  if (!code) return null;

  const isoDate = code.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoDate) {
    const [, yyyy, mm, dd] = isoDate;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    }
  }

  const ruDate = code.match(/(\d{1,2})[./-](\d{1,2})[./-](20\d{2})/);
  if (ruDate) {
    const [, dd, mm, yyyy] = ruDate;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d);
    }
  }

  return null;
}

export function grantBroadcastAccess(now = new Date()): void {
  try {
    const until = withTime(now, '13:05');
    sessionStorage.setItem(ACCESS_STORAGE_KEY, String(until.getTime()));
  } catch {
    /* ignore */
  }
}

export function hasBroadcastAccess(now = new Date()): boolean {
  try {
    const raw = sessionStorage.getItem(ACCESS_STORAGE_KEY);
    const ts = Number(raw);
    return Number.isFinite(ts) && ts > now.getTime();
  } catch {
    return false;
  }
}
