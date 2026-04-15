/**
 * Булевы флаги из API: в JS `Boolean("false") === true`, поэтому строки разбираем явно.
 */
export function apiBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null) return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 't' || s === 'yes';
  }
  return false;
}
