/** Год-заглушка: в БД храним только день и месяц (тип DATE). */
export const BIRTH_DATE_PLACEHOLDER_YEAR = 2000;

export function isValidBirthDayMonth(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(BIRTH_DATE_PLACEHOLDER_YEAR, month, 0).getDate();
  return day <= daysInMonth;
}

export function birthDayMonthToYmd(day: number, month: number): string | null {
  if (!isValidBirthDayMonth(day, month)) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${BIRTH_DATE_PLACEHOLDER_YEAR}-${mm}-${dd}`;
}

export function parseBirthDayMonthFromYmd(value: string | null | undefined): {
  day: number;
  month: number;
} | null {
  if (value == null) return null;
  const head = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidBirthDayMonth(day, month)) return null;
  return { day, month };
}

export function normalizeBirthDateYmd(value: string | null | undefined): string | null {
  const parsed = parseBirthDayMonthFromYmd(value);
  if (!parsed) return null;
  return birthDayMonthToYmd(parsed.day, parsed.month);
}
