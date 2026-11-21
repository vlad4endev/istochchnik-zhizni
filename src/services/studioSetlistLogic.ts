/**
 * Чистая логика сетлистов студии (без БД) — чтобы её можно было тестировать отдельно.
 */

const YMD_PREFIX = /^\d{4}-\d{2}-\d{2}/;

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Календарная дата `YYYY-MM-DD` из значения колонки DATE.
 *
 * node-postgres отдаёт DATE как `Date` в ЛОКАЛЬНОЙ полночи, поэтому
 * `String(date).slice(0, 10)` даёт «Sun Nov 22», а `toISOString()` может сдвинуть день.
 * Берём локальные компоненты — они совпадают с датой в БД.
 */
export function toYmd(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1, 2)}-${pad(value.getDate(), 2)}`;
  }
  const text = String(value);
  return YMD_PREFIX.test(text) ? text.slice(0, 10) : null;
}

/**
 * Итоговый порядок элементов сетлиста для перестановки.
 * Сначала — запрошенные id, которые реально принадлежат сетлисту (без дублей и чужих),
 * затем — элементы, которых клиент не знал (добавлены с другого устройства), в прежнем порядке.
 * Так позиции всегда образуют полную перестановку 0..n-1 без пропусков и повторов.
 */
export function mergeReorder(currentIds: number[], requestedIds: number[]): number[] {
  const known = new Set(currentIds);
  const seen = new Set<number>();
  const result: number[] = [];
  for (const id of requestedIds) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of currentIds) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}
