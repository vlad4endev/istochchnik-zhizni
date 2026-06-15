/** PostgreSQL TIMESTAMP без TZ — парсим как локальное «настенное» время (Europe/Moscow у пользователей). */
export function parseBroadcastStartsAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;

  let normalized = v;
  if (!v.includes('T') && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(v)) {
    normalized = v.replace(/^(\d{4}-\d{2}-\d{2})\s+/, '$1T');
  }
  // ISO с Z/offset — это момент времени; для отображения берём компоненты в локальной TZ браузера.
  if (/[zZ]$/.test(normalized) || /[+-]\d{2}:?\d{2}$/.test(normalized)) {
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatBroadcastStartsAtForApi(datePart: string, timePart: string): string | null {
  const date = datePart.trim();
  const time = timePart.trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return `${date} ${time}:00`;
}

export function splitBroadcastStartsAt(value: string | null | undefined): { date: string; time: string } {
  const dt = parseBroadcastStartsAt(value ?? null);
  if (!dt) return { date: '', time: '' };
  const y = dt.getFullYear();
  const m = `${dt.getMonth() + 1}`.padStart(2, '0');
  const d = `${dt.getDate()}`.padStart(2, '0');
  const h = `${dt.getHours()}`.padStart(2, '0');
  const min = `${dt.getMinutes()}`.padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${h}:${min}` };
}
