/**
 * Чистая логика сетлистов студии (без БД) — чтобы её можно было тестировать отдельно.
 */

export { toYmd } from '../utils/isoDates';

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
