/**
 * Ближайшая календарная дата для заданного дня недели (локальная таймзона браузера).
 * 0 = воскресенье … 6 = суббота — как `weekly_day` в API.
 */
export function nextOccurrenceLocalYmd(weeklyDay0Sun: number): string {
  const now = new Date();
  const cur = now.getDay();
  const delta = (weeklyDay0Sun - cur + 7) % 7;
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
