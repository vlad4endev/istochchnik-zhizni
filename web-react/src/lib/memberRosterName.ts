/**
 * Разбор ФИО для отображения и сортировки (как в админке: колонки или одно поле `name`).
 * — Если заданы и имя, и фамилия в колонках — берём их (канон: имя = first_name, фамилия = last_name).
 * — Если заполнена только одна колонка — недостающее подтягивается из `name` (две фамилии/имена не теряются).
 * — Только `name`, 3+ слова: «Фамилия Имя Отчество».
 * — Только `name`, 2 слова: «Имя Фамилия» (как при создании в БД: name = first + space + last).
 * Сортировка: `compareMembersByFirstName` — по имени; `compareMembersByPrayerCycleOrder` — по фамилии А–Я, затем имя.
 */

function splitFromNameField(raw: string): { first: string; last: string } {
  const r = raw.trim();
  if (!r) {
    return { first: '', last: '' };
  }
  const parts = r.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return { first: parts.slice(1).join(' '), last: parts[0] };
  }
  if (parts.length === 2) {
    return { first: parts[0], last: parts[1] };
  }
  return { first: parts[0] ?? '', last: '' };
}

export function splitMemberNameParts(input: {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}): { first: string; last: string } {
  const colF = (input.first_name ?? '').trim();
  const colL = (input.last_name ?? '').trim();
  const fromName = splitFromNameField(input.name ?? '');

  if (colF && colL) {
    return { first: colF, last: colL };
  }
  if (!colF && !colL) {
    return fromName;
  }
  return {
    first: colF || fromName.first,
    last: colL || fromName.last,
  };
}

/** Отображение в списках: «Фамилия Имя» (при одном слове — оно одно). */
export function memberRosterName(input: {
  id?: number;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const { first, last } = splitMemberNameParts(input);
  const s = `${last} ${first}`.trim();
  if (s) return s;
  return input.name.trim() || (input.id != null ? `#${input.id}` : '');
}

function localeRu(a: string, b: string): number {
  return a.localeCompare(b, 'ru', { sensitivity: 'base' });
}

/** Сортировка А–Я по имени (given name), при равенстве — по фамилии. */
export function compareMembersByFirstName(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const aa = splitMemberNameParts(a);
  const bb = splitMemberNameParts(b);
  const fCmp = localeRu(aa.first, bb.first);
  if (fCmp !== 0) return fCmp;
  const lCmp = localeRu(aa.last, bb.last);
  if (lCmp !== 0) return lCmp;
  return a.id - b.id;
}

/** А–Я по строке отображения («Фамилия Имя»), при равенстве — по id. */
export function compareMembersByDisplayNameRu(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const na = memberRosterName(a).trim();
  const nb = memberRosterName(b).trim();
  const c = localeRu(na, nb);
  if (c !== 0) return c;
  return a.id - b.id;
}

/** По фамилии А–Я, затем имя; без фамилии — в конце списка (стабильный порядок). */
export function compareMembersByPrayerCycleOrder(
  a: { id: number; name: string; first_name?: string | null; last_name?: string | null },
  b: typeof a,
): number {
  const aa = splitMemberNameParts(a);
  const bb = splitMemberNameParts(b);
  const aLast = aa.last.trim();
  const bLast = bb.last.trim();
  const aEmpty = !aLast;
  const bEmpty = !bLast;
  if (aEmpty !== bEmpty) {
    return aEmpty ? 1 : -1;
  }
  const lCmp = localeRu(aLast, bLast);
  if (lCmp !== 0) return lCmp;
  const fCmp = localeRu(aa.first.trim(), bb.first.trim());
  if (fCmp !== 0) return fCmp;
  return a.id - b.id;
}
