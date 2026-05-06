import { format, isThisYear, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * @param {{ date: Date }} props
 */
export function DateSeparator({ date }) {
  let label;
  if (isToday(date)) {
    label = 'Сегодня';
  } else if (isYesterday(date)) {
    label = 'Вчера';
  } else if (isThisYear(date)) {
    label = format(date, 'd MMMM', { locale: ru });
  } else {
    label = format(date, 'd MMMM yyyy', { locale: ru });
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <hr className="min-w-0 flex-1 border-gray-200 dark:border-gray-700" />
      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <hr className="min-w-0 flex-1 border-gray-200 dark:border-gray-700" />
    </div>
  );
}
