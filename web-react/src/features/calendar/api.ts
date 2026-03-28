import axios from 'axios';
import { format } from 'date-fns';

import { apiClient } from '../../lib/apiClient';
import type { DayPrayerData, Member, NextWeekMemberDay, PrayerCycleInfo } from '../../types';

import type { NextWeekCollectionSnapshot } from './collectionTypes';

/** Ключ даты для `/api/calendar/{date}` — `yyyy-MM-dd`. */
export function formatCalendarDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeMemberRow(raw: unknown): Member | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  if (name == null) return null;
  const idNum = typeof id === 'number' ? id : Number(id);
  if (!Number.isFinite(idNum)) return null;
  const pr = raw.prayer_request;
  return {
    id: idNum,
    name: String(name),
    prayer_request: typeof pr === 'string' ? pr : pr == null ? null : String(pr),
  };
}

function normalizeNextWeekDay(raw: unknown): NextWeekMemberDay | null {
  if (!isRecord(raw)) return null;
  const date = raw.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    date,
    member: normalizeMemberRow(raw.member),
  };
}

/**
 * GET `/api/calendar/next-week/members` — 7 дней (пн–вс) следующей календарной недели, по члену на день.
 */
export async function getNextWeekMembers(): Promise<NextWeekMemberDay[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/next-week/members');
  if (!isRecord(data) || !Array.isArray(data.days)) {
    throw new Error('Некорректный ответ API: next-week/members');
  }
  const out: NextWeekMemberDay[] = [];
  for (const row of data.days) {
    const day = normalizeNextWeekDay(row);
    if (day) out.push(day);
  }
  if (out.length !== data.days.length) {
    throw new Error('Некорректный ответ API: next-week/members');
  }
  return out;
}

function normalizePrayerCycle(raw: unknown): PrayerCycleInfo | null {
  if (raw == null) return null;
  if (!isRecord(raw)) return null;
  const index = raw.index;
  const number = raw.number;
  const member_count = raw.member_count;
  const start_date = raw.start_date;
  const end_date = raw.end_date;
  const day_index = raw.day_index;
  if (
    typeof index !== 'number' ||
    typeof number !== 'number' ||
    typeof member_count !== 'number' ||
    typeof start_date !== 'string' ||
    typeof end_date !== 'string' ||
    typeof day_index !== 'number'
  ) {
    return null;
  }
  return { index, number, member_count, start_date, end_date, day_index };
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
  const pc = normalizePrayerCycle(raw.prayer_cycle);
  return {
    date,
    diffDays,
    members: Array.isArray(raw.members) ? (raw.members as DayPrayerData['members']) : [],
    global_themes: Array.isArray(raw.global_themes)
      ? (raw.global_themes as DayPrayerData['global_themes'])
      : [],
    ministries: Array.isArray(raw.ministries) ? (raw.ministries as DayPrayerData['ministries']) : [],
    backsliders: Array.isArray(raw.backsliders) ? (raw.backsliders as DayPrayerData['backsliders']) : [],
    prayer_cycle: pc,
  };
}

function normalizeCollectionSnapshot(raw: unknown): NextWeekCollectionSnapshot {
  if (!isRecord(raw)) {
    throw new Error('Некорректный ответ API: next-week/collection');
  }
  const week_start = raw.week_start;
  const day_dates = raw.day_dates;
  const coordinator_rows = raw.coordinator_rows;
  const members_for_select = raw.members_for_select;
  if (typeof week_start !== 'string' || !Array.isArray(day_dates)) {
    throw new Error('Некорректный ответ API: next-week/collection');
  }
  if (!Array.isArray(coordinator_rows) || !Array.isArray(members_for_select)) {
    throw new Error('Некорректный ответ API: next-week/collection');
  }
  return {
    week_start,
    day_dates: day_dates as string[],
    coordinator_rows: coordinator_rows as NextWeekCollectionSnapshot['coordinator_rows'],
    members_for_select: members_for_select as NextWeekCollectionSnapshot['members_for_select'],
  };
}

/** GET — публично: кто назначен ответственными за сбор; can_edit для текущего пользователя. */
export async function getNextWeekCollection(): Promise<NextWeekCollectionSnapshot> {
  const { data } = await apiClient.get<unknown>('/api/calendar/next-week/collection');
  return normalizeCollectionSnapshot(data);
}

/** PATCH — только ответственный за сбор (свой список). */
export async function patchNextWeekCollection(
  picks: Record<string, number | null>,
): Promise<NextWeekCollectionSnapshot> {
  const { data } = await apiClient.patch<unknown>('/api/calendar/next-week/collection', {
    picks,
  });
  return normalizeCollectionSnapshot(data);
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
