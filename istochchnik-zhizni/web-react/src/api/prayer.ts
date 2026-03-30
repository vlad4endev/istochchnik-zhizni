import type { DayPrayerData } from '../types';

/**
 * Пустой VITE_API_BASE_URL: запросы на тот же origin (dev: proxy Vite → :40978).
 * Иначе полный URL бэкенда без trailing slash.
 */
function apiOrigin(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';
  return raw.replace(/\/$/, '');
}

function calendarPath(date: string): string {
  const prefix = `${apiOrigin()}/api/calendar/${date}`;
  return apiOrigin() === '' ? `/api/calendar/${date}` : prefix;
}

export async function fetchPrayerByDate(date: string): Promise<DayPrayerData> {
  const res = await fetch(calendarPath(date), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      res.status === 404
        ? 'Маршрут календаря не найден. Проверьте, что API запущен (порт 40978).'
        : `Ошибка ${res.status}: ${text.slice(0, 200)}`
    );
  }

  return (await res.json()) as DayPrayerData;
}
