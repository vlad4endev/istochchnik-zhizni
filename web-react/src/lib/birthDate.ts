export const BIRTH_DATE_PLACEHOLDER_YEAR = 2000;

export const BIRTH_MONTH_NAMES_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
] as const;

export const BIRTH_MONTH_OPTIONS = BIRTH_MONTH_NAMES_RU.map((label, index) => ({
  value: String(index + 1),
  label: label.charAt(0).toUpperCase() + label.slice(1),
}));

export function isValidBirthDayMonth(day: number, month: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(BIRTH_DATE_PLACEHOLDER_YEAR, month, 0).getDate();
  return day <= daysInMonth;
}

export function birthDayMonthToApiYmd(day: number, month: number): string | null {
  if (!isValidBirthDayMonth(day, month)) return null;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${BIRTH_DATE_PLACEHOLDER_YEAR}-${mm}-${dd}`;
}

export function parseBirthDayMonthFromApi(value: string | null | undefined): {
  day: string;
  month: string;
} {
  if (value == null) return { day: '', month: '' };
  const head = String(value).trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (!m) return { day: '', month: '' };
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidBirthDayMonth(day, month)) return { day: '', month: '' };
  return { day: String(day), month: String(month) };
}

export function formatBirthDateDisplay(value: string | null | undefined): string {
  const parsed = parseBirthDayMonthFromApi(value);
  if (!parsed.day || !parsed.month) return '';
  const monthIndex = Number(parsed.month) - 1;
  const monthName = BIRTH_MONTH_NAMES_RU[monthIndex];
  if (!monthName) return '';
  return `${parsed.day} ${monthName}`;
}

export function daysInBirthMonth(month: number): number {
  if (month < 1 || month > 12) return 31;
  return new Date(BIRTH_DATE_PLACEHOLDER_YEAR, month, 0).getDate();
}
