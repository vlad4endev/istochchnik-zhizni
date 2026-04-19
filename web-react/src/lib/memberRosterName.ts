/**
 * Разбор ФИО для отображения и сортировки (как в админке: колонки или одно поле `name`).
 * — 3+ слова в `name`: «Фамилия Имя Отчество».
 * — 2 слова в `name`: «Имя Фамилия» (как при создании в админке).
 * Сортировка списков: по полю «имя» (first), затем «фамилия» (last).
 */
export function splitMemberNameParts(input: {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}): { first: string; last: string } {
  let f = (input.first_name ?? '').trim();
  let l = (input.last_name ?? '').trim();
  if (f || l) {
    return { first: f, last: l };
  }
  const raw = (input.name ?? '').trim();
  if (!raw) {
    return { first: '', last: '' };
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return { first: parts.slice(1).join(' '), last: parts[0] };
  }
  if (parts.length === 2) {
    return { first: parts[0], last: parts[1] };
  }
  return { first: parts[0] ?? '', last: '' };
}

/** Отображение в списках и молитве: «Имя Фамилия» (как колонки в админке). */
export function memberRosterName(input: {
  id?: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const { first, last } = splitMemberNameParts(input);
  const s = `${first} ${last}`.trim();
  if (s) return s;
  return input.name.trim() || (input.id != null ? `#${input.id}` : '');
}

/** Сортировка А–Я по имени (given name), при равенстве — по фамилии. */
export function compareMembersByFirstName(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const aa = splitMemberNameParts(a);
  const bb = splitMemberNameParts(b);
  const fCmp = aa.first.localeCompare(bb.first, 'ru', { sensitivity: 'base' });
  if (fCmp !== 0) return fCmp;
  const lCmp = aa.last.localeCompare(bb.last, 'ru', { sensitivity: 'base' });
  if (lCmp !== 0) return lCmp;
  return a.id - b.id;
}

/** А–Я по строке как в списках («Имя Фамилия»), при равенстве — по id. */
export function compareMembersByDisplayNameRu(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const na = memberRosterName(a).trim();
  const nb = memberRosterName(b).trim();
  const c = na.localeCompare(nb, 'ru', { sensitivity: 'base' });
  if (c !== 0) return c;
  return a.id - b.id;
}

/** Как в молитвенном цикле в БД: фамилия, имя, id. */
export function compareMembersByPrayerCycleOrder(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const aa = splitMemberNameParts(a);
  const bb = splitMemberNameParts(b);
  const lCmp = aa.last.localeCompare(bb.last, 'ru', { sensitivity: 'base' });
  if (lCmp !== 0) return lCmp;
  const fCmp = aa.first.localeCompare(bb.first, 'ru', { sensitivity: 'base' });
  if (fCmp !== 0) return fCmp;
  return a.id - b.id;
}
