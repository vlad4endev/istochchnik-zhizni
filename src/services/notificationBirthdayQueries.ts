import { query } from '../config/db';

function fullNameOrFallback(row: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string {
  const fn = (row.first_name ?? '').trim();
  const ln = (row.last_name ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  if (full) return full;
  return (row.name ?? '').trim() || 'Участник';
}

function birthdayMonthDay(birthDateYmd: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateYmd);
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}

function startOfWeekMondayFromYmd(year: number, month: number, day: number): Date {
  const d = new Date(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  const dayJs = d.getDay();
  const diff = dayJs === 0 ? -6 : 1 - dayJs;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Имена с днём рождения в указанный календарный день (месяц/день), активные участники. */
export async function getBirthdayNamesForCalendarDay(month: number, day: number): Promise<string[]> {
  const result = await query(
    `SELECT first_name, last_name, name, birth_date::text AS birth_date
     FROM members
     WHERE is_active = TRUE AND birth_date IS NOT NULL`,
  );
  const names: string[] = [];
  for (const rowRaw of result.rows) {
    const row = rowRaw as {
      first_name?: string | null;
      last_name?: string | null;
      name?: string | null;
      birth_date?: string;
    };
    if (typeof row.birth_date !== 'string') continue;
    const md = birthdayMonthDay(row.birth_date);
    if (!md || md.month !== month || md.day !== day) continue;
    names.push(fullNameOrFallback(row));
  }
  names.sort((a, b) => a.localeCompare(b, 'ru'));
  return names;
}

/**
 * Имена с днями рождения в календарную неделю (пн–вс), где «сегодня» — переданная дата в григорианском календаре.
 */
export async function getBirthdayNamesForWeekAroundDate(
  year: number,
  month: number,
  day: number,
): Promise<string[]> {
  const weekStart = startOfWeekMondayFromYmd(year, month, day);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const years = Array.from(new Set([weekStart.getFullYear(), weekEnd.getFullYear()]));

  const result = await query(
    `SELECT first_name, last_name, name, birth_date::text AS birth_date
     FROM members
     WHERE is_active = TRUE AND birth_date IS NOT NULL`,
  );

  function birthdayForYear(birthDateYmd: string, y: number): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDateYmd);
    if (!m) return null;
    const mo = Number(m[2]);
    const dday = Number(m[3]);
    const d = new Date(y, mo - 1, dday);
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== dday) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const names = new Set<string>();
  for (const rowRaw of result.rows) {
    const row = rowRaw as {
      first_name?: string | null;
      last_name?: string | null;
      name?: string | null;
      birth_date?: string;
    };
    if (typeof row.birth_date !== 'string') continue;
    for (const y of years) {
      const hit = birthdayForYear(row.birth_date, y);
      if (!hit) continue;
      if (hit.getTime() >= weekStart.getTime() && hit.getTime() <= weekEnd.getTime()) {
        names.add(fullNameOrFallback(row));
        break;
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ru'));
}
