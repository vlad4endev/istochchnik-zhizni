import axios from 'axios';
import { format } from 'date-fns';

import { apiClient } from '../../lib/apiClient';
import type { DayPrayerData, Member, NextWeekMemberDay, PrayerCycleInfo } from '../../types';

import type { CycleCollectionClaimsSnapshot } from './collectionTypes';

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

function normalizeClaimRow(raw: unknown): import('./collectionTypes').CycleCollectionClaimRow | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const can_toggle = raw.can_toggle;
  if (typeof id !== 'number' || typeof name !== 'string' || typeof can_toggle !== 'boolean') return null;
  let claimed_by: { id: number; name: string } | null = null;
  if (raw.claimed_by === null) {
    claimed_by = null;
  } else if (isRecord(raw.claimed_by)) {
    const cid = raw.claimed_by.id;
    const cname = raw.claimed_by.name;
    if (typeof cid === 'number' && typeof cname === 'string') {
      claimed_by = { id: cid, name: cname };
    }
  }
  return { id, name, claimed_by, can_toggle };
}

function normalizeCycleCollectionSnapshot(raw: unknown): CycleCollectionClaimsSnapshot {
  if (!isRecord(raw)) {
    throw new Error('Некорректный ответ API: cycle/collection-claims');
  }
  const cycle_index = raw.cycle_index;
  const cycle_number = raw.cycle_number;
  const members = raw.members;
  if (typeof cycle_index !== 'number' || typeof cycle_number !== 'number' || !Array.isArray(members)) {
    throw new Error('Некорректный ответ API: cycle/collection-claims');
  }
  const rows: import('./collectionTypes').CycleCollectionClaimRow[] = [];
  for (const m of members) {
    const r = normalizeClaimRow(m);
    if (!r) {
      throw new Error('Некорректный ответ API: cycle/collection-claims');
    }
    rows.push(r);
  }
  return { cycle_index, cycle_number, members: rows };
}

export async function getCycleCollectionClaims(): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.get<unknown>('/api/calendar/cycle/collection-claims');
  return normalizeCycleCollectionSnapshot(data);
}

export async function patchCycleCollectionClaim(
  memberId: number,
  claim: boolean,
): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.patch<unknown>('/api/calendar/cycle/collection-claims', {
    member_id: memberId,
    claim,
  });
  return normalizeCycleCollectionSnapshot(data);
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
