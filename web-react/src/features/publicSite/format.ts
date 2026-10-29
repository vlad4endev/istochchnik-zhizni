const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function formatEventDateRu(ymd: string, time?: string | null): string {
  const raw = String(ymd || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw || '—';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? '';
  const datePart = `${d.toString().padStart(2, '0')}.${mo.toString().padStart(2, '0')}.${y}`;
  const t = String(time ?? '')
    .trim()
    .slice(0, 5);
  return t ? `${weekday}, ${datePart} · ${t}` : `${weekday}, ${datePart}`;
}

export function formatBroadcastStartsAt(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  return `${m[3]}.${m[2]}.${m[1]} · ${m[4]}:${m[5]}`;
}
