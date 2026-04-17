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
  const pu = raw.prayer_need_updated_at;
  const prevManualNeedsRaw = raw.previous_manual_prayer_needs;
  const fn = raw.first_name;
  const ln = raw.last_name;
  const previous_manual_prayer_needs = Array.isArray(prevManualNeedsRaw)
    ? prevManualNeedsRaw
        .map((item) => {
          if (!isRecord(item)) return null;
          const itemId = item.id;
          const note = item.note;
          const createdAt = item.created_at;
          const srcRaw = item.source;
          const parsedId = typeof itemId === 'number' ? itemId : Number(itemId);
          if (!Number.isFinite(parsedId) || typeof note !== 'string' || typeof createdAt !== 'string') {
            return null;
          }
          if (!note.trim()) return null;
          const source =
            srcRaw === 'journal' || srcRaw === 'manual' ? srcRaw : undefined;
          return source ? { id: parsedId, note, created_at: createdAt, source } : { id: parsedId, note, created_at: createdAt };
        })
        .filter(
          (x): x is { id: number; note: string; created_at: string; source?: 'manual' | 'journal' } =>
            x != null,
        )
    : [];
  return {
    id: idNum,
    name: String(name),
    first_name: typeof fn === 'string' || fn === null ? fn : undefined,
    last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    prayer_request: typeof pr === 'string' ? pr : pr == null ? null : String(pr),
    prayer_need_updated_at:
      typeof pu === 'string' ? pu : pu == null || pu === undefined ? null : String(pu),
    previous_manual_prayer_needs,
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

export type WeekPlanKind = 'current' | 'next';

export interface CuratorDistributionRunResponse {
  ok: boolean;
  week_kind: WeekPlanKind;
  week: { weekNumber: number; year: number };
  cycle_index: number;
  total: number;
  notify_curators: boolean;
  pushed_coordinators: number;
}

export interface ChurchEventItem {
  id: number;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  recurrence_type: 'once' | 'weekly';
  weekly_day: number | null;
  is_active: boolean;
  category?: string | null;
  poster_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BirthdayWeekItem {
  id: number;
  name: string;
  birth_date: string;
  week_date: string;
}

export interface BirthdayWeekResponse {
  week_start: string;
  week_end: string;
  items: BirthdayWeekItem[];
}

/**
 * GET `/api/calendar/next-week/members` — 7 дней (пн–вс) выбранной недели, по члену на день.
 * @param week `current` — текущая календарная неделя, `next` — следующая (по умолчанию).
 */
export async function getWeekPlanMembers(week: WeekPlanKind = 'next'): Promise<NextWeekMemberDay[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/next-week/members', {
    params: { week },
  });
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

/** @deprecated используйте getWeekPlanMembers */
export async function getNextWeekMembers(): Promise<NextWeekMemberDay[]> {
  return getWeekPlanMembers('next');
}

export async function patchMemberCyclePrayer(
  memberId: number,
  targetDate: string,
  prayerRequest: string
): Promise<void> {
  await apiClient.patch('/api/calendar/member-cycle-prayer', {
    member_id: memberId,
    target_date: targetDate,
    prayer_request: prayerRequest,
  });
}

/** Улучшить черновик нужды через ИИ (сервер: раздел промпта «Молитвенный календарь»). */
export async function improvePrayerNeedTextWithAi(text: string, memberName?: string): Promise<string> {
  const { data } = await apiClient.post<{ text: string }>('/api/calendar/prayer-need/improve-text', {
    text,
    member_name: memberName?.trim() ?? '',
  });
  if (typeof data?.text !== 'string') {
    throw new Error('Некорректный ответ: нет текста');
  }
  return data.text;
}

export async function patchMemberPreviousPrayerNeed(
  memberId: number,
  note: string
): Promise<void> {
  await apiClient.patch('/api/calendar/member-previous-prayer-need', {
    member_id: memberId,
    note,
  });
}

export async function putMemberPreviousPrayerNeed(
  id: number,
  note: string
): Promise<void> {
  await apiClient.put(`/api/calendar/member-previous-prayer-need/${id}`, { note });
}

export async function deleteMemberPreviousPrayerNeed(id: number): Promise<void> {
  await apiClient.delete(`/api/calendar/member-previous-prayer-need/${id}`);
}

export async function getActiveEvents(): Promise<ChurchEventItem[]> {
  const { data } = await apiClient.get<ChurchEventItem[]>('/api/calendar/events');
  return Array.isArray(data) ? data : [];
}

export async function getWeekBirthdays(): Promise<BirthdayWeekResponse> {
  const { data } = await apiClient.get<unknown>('/api/calendar/birthdays/week');
  if (!isRecord(data)) {
    return { week_start: '', week_end: '', items: [] };
  }
  const itemsRaw = Array.isArray(data.items) ? data.items : [];
  const items: BirthdayWeekItem[] = itemsRaw
    .map((row) => {
      if (!isRecord(row)) return null;
      const id = typeof row.id === 'number' ? row.id : Number(row.id);
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      const birthDate = typeof row.birth_date === 'string' ? row.birth_date : '';
      const weekDate = typeof row.week_date === 'string' ? row.week_date : '';
      if (!Number.isFinite(id) || !name || !/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) return null;
      return { id, name, birth_date: birthDate, week_date: weekDate };
    })
    .filter((x): x is BirthdayWeekItem => x != null);

  return {
    week_start: typeof data.week_start === 'string' ? data.week_start : '',
    week_end: typeof data.week_end === 'string' ? data.week_end : '',
    items,
  };
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
  const membersRaw = Array.isArray(raw.members) ? raw.members : [];
  const members: Member[] = [];
  for (const m of membersRaw) {
    const row = normalizeMemberRow(m);
    if (row) members.push(row);
  }
  return {
    date,
    diffDays,
    members,
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
  const fn = raw.first_name;
  const ln = raw.last_name;
  let claimed_by: import('./collectionTypes').CycleCollectionClaimRow['claimed_by'] = null;
  if (raw.claimed_by === null) {
    claimed_by = null;
  } else if (isRecord(raw.claimed_by)) {
    const cid = raw.claimed_by.id;
    const cname = raw.claimed_by.name;
    const cfn = raw.claimed_by.first_name;
    const cln = raw.claimed_by.last_name;
    if (typeof cid === 'number' && typeof cname === 'string') {
      claimed_by = {
        id: cid,
        name: cname,
        first_name: typeof cfn === 'string' || cfn === null ? cfn : undefined,
        last_name: typeof cln === 'string' || cln === null ? cln : undefined,
      };
    }
  }
  return {
    id,
    name,
    first_name: typeof fn === 'string' || fn === null ? fn : undefined,
    last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    claimed_by,
    can_toggle,
  };
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

export async function getCycleCollectionClaims(week?: WeekPlanKind): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.get<unknown>('/api/calendar/cycle/collection-claims', {
    params: week ? { week } : {},
  });
  return normalizeCycleCollectionSnapshot(data);
}

export async function patchCycleCollectionClaim(
  memberId: number,
  claim: boolean,
  week?: WeekPlanKind,
): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.patch<unknown>('/api/calendar/cycle/collection-claims', {
    member_id: memberId,
    claim,
    ...(week ? { week } : {}),
  });
  return normalizeCycleCollectionSnapshot(data);
}

export async function runCuratorAutoDistribution(
  weekKind: WeekPlanKind,
): Promise<CuratorDistributionRunResponse> {
  const { data } = await apiClient.post<CuratorDistributionRunResponse>(
    '/api/calendar/next-week/curator-distribution',
    {
      week_kind: weekKind,
      notify_curators: true,
    },
  );
  return data;
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

export type DashboardCoordinatorNoteKind = 'urgent_prayer' | 'announcement';
export type DashboardCoordinatorDuration = 'day' | 'week' | 'month';

export interface DashboardCoordinatorNotePayload {
  text: string;
  start_date: string;
  end_date: string;
}

export interface DashboardCoordinatorNotesResponse {
  urgent_prayer: DashboardCoordinatorNotePayload | null;
  announcement: DashboardCoordinatorNotePayload | null;
}

function normalizeDashboardNote(raw: unknown): DashboardCoordinatorNotePayload | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === 'string' ? o.text : '';
  const start_date = typeof o.start_date === 'string' ? o.start_date : '';
  const end_date = typeof o.end_date === 'string' ? o.end_date : '';
  if (!start_date || !end_date) return null;
  if (!text.trim()) return null;
  return { text: text.trim(), start_date, end_date };
}

function normalizeDashboardCoordinatorResponse(raw: unknown): DashboardCoordinatorNotesResponse {
  if (raw == null || typeof raw !== 'object') {
    return { urgent_prayer: null, announcement: null };
  }
  const o = raw as Record<string, unknown>;
  return {
    urgent_prayer: normalizeDashboardNote(o.urgent_prayer),
    announcement: normalizeDashboardNote(o.announcement),
  };
}

/** Срочная нужда и объявление координаторов: видимость на календарную дату `forDate`. */
export async function fetchDashboardCoordinatorNotes(forDate: string): Promise<DashboardCoordinatorNotesResponse> {
  const { data } = await apiClient.get<unknown>('/api/calendar/dashboard-coordinator-notes', {
    params: { for_date: forDate },
  });
  return normalizeDashboardCoordinatorResponse(data);
}

export async function saveDashboardCoordinatorNote(input: {
  kind: DashboardCoordinatorNoteKind;
  text: string;
  duration: DashboardCoordinatorDuration;
  today_key: string;
}): Promise<DashboardCoordinatorNotesResponse> {
  const { data } = await apiClient.post<unknown>('/api/calendar/dashboard-coordinator-notes', input);
  return normalizeDashboardCoordinatorResponse(data);
}

/** Текущие записи в БД (в т.ч. с истёкшим сроком) — только для координаторов/админа. */
export async function fetchDashboardCoordinatorNotesForManage(): Promise<DashboardCoordinatorNotesResponse> {
  const { data } = await apiClient.get<unknown>('/api/calendar/dashboard-coordinator-notes', {
    params: { scope: 'manage' },
  });
  return normalizeDashboardCoordinatorResponse(data);
}

export async function deleteDashboardCoordinatorNote(
  kind: DashboardCoordinatorNoteKind,
  forDate?: string,
): Promise<DashboardCoordinatorNotesResponse> {
  const path = `/api/calendar/dashboard-coordinator-notes/${encodeURIComponent(kind)}`;
  const { data } = await apiClient.delete<unknown>(path, {
    params: forDate ? { for_date: forDate } : {},
  });
  return normalizeDashboardCoordinatorResponse(data);
}
