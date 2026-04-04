/**
 * Приводит дату из API (PostgreSQL DATE как ISO, или уже YYYY-MM-DD) к значению для <input type="date">.
 */
export function dateInputValueFromApi(value: string | null | undefined): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (s.length < 10) return '';
  const head = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : '';
}
