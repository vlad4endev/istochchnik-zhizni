/**
 * Normalize member id lists from clients (JSON may send numbers or numeric strings).
 */
export function parsePositiveMemberIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    let n = NaN;
    if (typeof item === 'number') {
      n = item;
    } else if (typeof item === 'string') {
      n = Number(item.trim());
    } else if (typeof item === 'bigint') {
      n = Number(item);
    }
    if (!Number.isFinite(n)) continue;
    const id = Math.trunc(n);
    if (id < 1 || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
