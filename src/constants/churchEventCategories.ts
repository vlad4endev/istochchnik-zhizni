/**
 * Категории событий календаря: и API, и админка.
 *
 * Переопределение списка: `CHURCH_EVENT_ALLOWED_CATEGORIES=id1,id2` (тогда подписи для неизвестных id = сам id).
 * Значение по умолчанию при INSERT: `CHURCH_EVENT_DEFAULT_CATEGORY` (должен входить в разрешённый список).
 */

export type ChurchEventCategoryOption = { id: string; label: string };

const BUILTIN: readonly ChurchEventCategoryOption[] = [
  { id: 'service', label: 'Богослужение' },
  { id: 'worship', label: 'Поклонение' },
  { id: 'prayer', label: 'Молитва' },
  { id: 'bible_study', label: 'Изучение Библии' },
  { id: 'youth', label: 'Молодёжь' },
  { id: 'children', label: 'Дети' },
  { id: 'community', label: 'Общение' },
  { id: 'outreach', label: 'Евангелизация' },
  { id: 'other', label: 'Другое' },
] as const;

const builtinLabelById = new Map(BUILTIN.map((o) => [o.id, o.label]));

/**
 * Актуальный список для API и проверок. Без env — встроенный набор.
 */
export function getChurchEventCategoryOptionsForApi(): ChurchEventCategoryOption[] {
  const raw = process.env.CHURCH_EVENT_ALLOWED_CATEGORIES?.trim();
  if (!raw) {
    return BUILTIN.map((o) => ({ id: o.id, label: o.label }));
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, label: builtinLabelById.get(id) ?? id }));
}

export function getChurchEventCategoryIdSet(): Set<string> {
  return new Set(getChurchEventCategoryOptionsForApi().map((o) => o.id));
}

export function defaultChurchEventCategory(): string {
  const opts = getChurchEventCategoryOptionsForApi();
  const ids = getChurchEventCategoryIdSet();
  const env = process.env.CHURCH_EVENT_DEFAULT_CATEGORY?.trim();
  if (env && ids.has(env)) {
    return env;
  }
  return opts[0]?.id ?? 'service';
}

export function isAllowedChurchEventCategory(id: string): boolean {
  return getChurchEventCategoryIdSet().has(id);
}
