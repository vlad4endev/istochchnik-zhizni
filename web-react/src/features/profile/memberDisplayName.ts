/**
 * Имя для показа: всегда «Имя Фамилия» из полей members, без обратного порядка.
 * Если частей нет — запасной вариант `name` (одна строка из БД).
 */
export function memberNameFirstLast(parts: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string {
  const fn = (parts.first_name ?? '').trim();
  const ln = (parts.last_name ?? '').trim();
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  return (parts.name ?? '').trim();
}
