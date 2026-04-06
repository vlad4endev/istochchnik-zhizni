/**
 * Резерв, если GET `/events/category-options` недоступен.
 * Основной список: `src/constants/churchEventCategories.ts` (сервер).
 */
export const CHURCH_EVENT_CATEGORY_OPTIONS_FALLBACK: { id: string; label: string }[] = [
  { id: 'service', label: 'Богослужение' },
  { id: 'worship', label: 'Поклонение' },
  { id: 'prayer', label: 'Молитва' },
  { id: 'bible_study', label: 'Изучение Библии' },
  { id: 'youth', label: 'Молодёжь' },
  { id: 'children', label: 'Дети' },
  { id: 'community', label: 'Общение' },
  { id: 'outreach', label: 'Евангелизация' },
  { id: 'other', label: 'Другое' },
];
