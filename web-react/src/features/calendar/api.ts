import axios from 'axios';
import { format } from 'date-fns';

import { apiClient } from '../../lib/apiClient';
import type { DayPrayerData } from '../../types';

/** Ключ даты для `/api/calendar/{date}` — `yyyy-MM-dd`. */
export function formatCalendarDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeDayPrayer(raw: unknown): DayPrayerData {
  if (!isRecord(raw)) {
    throw new Error('Некорректный ответ API календаря');
  }
  const date = raw.date;
  const diffRaw = raw.diffDays ?? raw.diff_days;
  const diffDays = typeof diffRaw === 'number' ? diffRaw : Number(diffRaw);
  if (typeof date !== 'string' || !Number.isFinite(diffDays)) {
    throw new Error('Некорректный ответ API календаря: нет date/diffDays');
  }
  return {
    date,
    diffDays,
    members: Array.isArray(raw.members) ? (raw.members as DayPrayerData['members']) : [],
    global_themes: Array.isArray(raw.global_themes)
      ? (raw.global_themes as DayPrayerData['global_themes'])
      : [],
    ministries: Array.isArray(raw.ministries) ? (raw.ministries as DayPrayerData['ministries']) : [],
    backsliders: Array.isArray(raw.backsliders) ? (raw.backsliders as DayPrayerData['backsliders']) : [],
  };
}

/**
 * GET `/api/calendar/{dateKey}`.
 * @returns `null`, если записи нет (404).
 */
export async function getCalendarDay(dateKey: string): Promise<DayPrayerData | null> {
  const path = `/api/calendar/${encodeURIComponent(dateKey)}`;
  try {
    const { data } = await apiClient.get<unknown>(path);
    return normalizeDayPrayer(data);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      return null;
    }
    throw e;
  }
}
