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
  const ipcRaw = raw.in_prayer_cycle;
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
  let in_prayer_cycle: boolean | undefined;
  if (typeof ipcRaw === 'boolean') {
    in_prayer_cycle = ipcRaw;
  } else if (ipcRaw === 1 || ipcRaw === '1' || ipcRaw === 'true') {
    in_prayer_cycle = true;
  } else if (ipcRaw === 0 || ipcRaw === '0' || ipcRaw === 'false') {
    in_prayer_cycle = false;
  }
  return {
    id: idNum,
    name: String(name),
    first_name: typeof fn === 'string' || fn === null ? fn : undefined,
    last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    ...(in_prayer_cycle === undefined ? {} : { in_prayer_cycle }),
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
  /** Начало периода показа (`YYYY-MM-DD`), по умолчанию как `event_date`. */
  active_from?: string | null;
  /** Конец периода показа; пусто — без ограничения. */
  active_to?: string | null;
  /** Еженедельное: скрыть июнь–август. */
  skip_summer_break?: boolean;
  created_at: string;
  updated_at: string;
}

/** Переопределение полей для одной даты еженедельной серии. */
export interface ChurchEventOccurrenceOverride {
  id: number;
  event_id: number;
  occurrence_date: string;
  title: string | null;
  description: string | null;
  event_time: string | null;
  poster_url: string | null;
  is_hidden: boolean;
}

function normalizeOccurrenceOverride(raw: unknown): ChurchEventOccurrenceOverride | null {
  if (!isRecord(raw)) return null;
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  const event_id = typeof raw.event_id === 'number' ? raw.event_id : Number(raw.event_id);
  if (!Number.isFinite(id) || !Number.isFinite(event_id)) return null;
  const occurrence_date =
    typeof raw.occurrence_date === 'string' ? raw.occurrence_date.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrence_date)) return null;
  const title =
    raw.title === null || raw.title === undefined
      ? null
      : typeof raw.title === 'string'
        ? raw.title.trim() || null
        : null;
  const description =
    raw.description === null || raw.description === undefined
      ? null
      : typeof raw.description === 'string'
        ? raw.description
        : null;
  const event_time =
    raw.event_time === null || raw.event_time === undefined
      ? null
      : typeof raw.event_time === 'string'
        ? raw.event_time.trim() || null
        : null;
  const poster_url =
    raw.poster_url === null || raw.poster_url === undefined
      ? null
      : typeof raw.poster_url === 'string'
        ? raw.poster_url.trim() || null
        : null;
  const is_hidden = Boolean(raw.is_hidden);
  return {
    id,
    event_id,
    occurrence_date,
    title,
    description,
    event_time,
    poster_url,
    is_hidden,
  };
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

export async function getOccurrenceOverrides(): Promise<ChurchEventOccurrenceOverride[]> {
  const { data } = await apiClient.get<unknown>('/api/calendar/events/occurrence-overrides');
  if (!Array.isArray(data)) return [];
  const out: ChurchEventOccurrenceOverride[] = [];
  for (const row of data) {
    const o = normalizeOccurrenceOverride(row);
    if (o) out.push(o);
  }
  return out;
}

export async function putOccurrenceOverride(
  eventId: number,
  occurrenceYmd: string,
  body: {
    title: string | null;
    description: string | null;
    event_time: string | null;
    poster_url: string | null;
    is_hidden: boolean;
  },
): Promise<ChurchEventOccurrenceOverride> {
  const path = `/api/calendar/events/${encodeURIComponent(String(eventId))}/occurrences/${encodeURIComponent(occurrenceYmd)}`;
  const { data } = await apiClient.put<unknown>(path, body);
  const o = normalizeOccurrenceOverride(data);
  if (!o) {
    throw new Error('Некорректный ответ при сохранении правки даты');
  }
  return o;
}

export async function deleteOccurrenceOverrideForDate(eventId: number, occurrenceYmd: string): Promise<void> {
  const path = `/api/calendar/events/${encodeURIComponent(String(eventId))}/occurrences/${encodeURIComponent(occurrenceYmd)}`;
  await apiClient.delete(path);
}

export async function markEventRead(eventId: number): Promise<void> {
  await apiClient.post(`/api/events/${encodeURIComponent(String(eventId))}/read`);
}

export async function fetchUnreadEventsCount(): Promise<number> {
  const { data } = await apiClient.get<{ count?: number }>('/api/events/unread-count');
  const n = Number(data?.count);
  return Number.isFinite(n) && n > 0 ? n : 0;
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
  const coordinatorsRaw = raw.coordinators;
  if (
    typeof cycle_index !== 'number' ||
    typeof cycle_number !== 'number' ||
    !Array.isArray(members) ||
    !Array.isArray(coordinatorsRaw)
  ) {
    throw new Error('Некорректный ответ API: cycle/collection-claims');
  }
  const coordinators: import('./collectionTypes').CycleCollectionCoordinatorRow[] = [];
  for (const row of coordinatorsRaw) {
    if (!isRecord(row)) continue;
    const id = row.id;
    const name = row.name;
    if (typeof id !== 'number' || typeof name !== 'string') continue;
    const fn = row.first_name;
    const ln = row.last_name;
    coordinators.push({
      id,
      name,
      first_name: typeof fn === 'string' || fn === null ? fn : undefined,
      last_name: typeof ln === 'string' || ln === null ? ln : undefined,
    });
  }
  const rows: import('./collectionTypes').CycleCollectionClaimRow[] = [];
  for (const m of members) {
    const r = normalizeClaimRow(m);
    if (!r) {
      throw new Error('Некорректный ответ API: cycle/collection-claims');
    }
    rows.push(r);
  }
  return { cycle_index, cycle_number, coordinators, members: rows };
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
  assignedCoordinatorId?: number,
): Promise<CycleCollectionClaimsSnapshot> {
  const { data } = await apiClient.patch<unknown>('/api/calendar/cycle/collection-claims', {
    member_id: memberId,
    claim,
    ...(week ? { week } : {}),
    ...(typeof assignedCoordinatorId === 'number' ? { assigned_coordinator_id: assignedCoordinatorId } : {}),
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

export interface PrayerSectionViewer {
  member_id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  first_seen_at: string;
}

export interface PrayerSectionTodayViewersResponse {
  date: string;
  unique_viewers_today: number;
  viewers: PrayerSectionViewer[];
}

function normalizePrayerSectionViewer(raw: unknown): PrayerSectionViewer | null {
  if (!isRecord(raw)) return null;
  const memberId = Number(raw.member_id);
  if (!Number.isFinite(memberId) || memberId <= 0) return null;
  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim()
      : `#${memberId}`;
  return {
    member_id: memberId,
    name,
    first_name: typeof raw.first_name === 'string' ? raw.first_name : null,
    last_name: typeof raw.last_name === 'string' ? raw.last_name : null,
    avatar_url: typeof raw.avatar_url === 'string' ? raw.avatar_url : null,
    first_seen_at: typeof raw.first_seen_at === 'string' ? raw.first_seen_at : '',
  };
}

function normalizePrayerSectionTodayViewers(raw: unknown): PrayerSectionTodayViewersResponse {
  if (!isRecord(raw)) return { date: '', unique_viewers_today: 0, viewers: [] };
  const date = typeof raw.date === 'string' ? raw.date : '';
  const n = raw.unique_viewers_today;
  const unique_viewers_today =
    typeof n === 'number' && Number.isFinite(n) ? n : Number.isFinite(Number(n)) ? Number(n) : 0;
  const viewersRaw = Array.isArray(raw.viewers) ? raw.viewers : [];
  const viewers = viewersRaw
    .map(normalizePrayerSectionViewer)
    .filter((v): v is PrayerSectionViewer => v != null);
  return { date, unique_viewers_today, viewers };
}

/** Сколько разных участников заходили в раздел «Молитва» за текущий календарный день (по времени церкви на сервере). */
export async function fetchPrayerSectionTodayViewers(): Promise<PrayerSectionTodayViewersResponse> {
  const { data } = await apiClient.get<unknown>('/api/calendar/prayer-section/today-viewers');
  return normalizePrayerSectionTodayViewers(data);
}

/** Фиксирует визит текущего пользователя (не более одного раза в сутки на человека). */
export async function postPrayerSectionVisit(): Promise<void> {
  await apiClient.post('/api/calendar/prayer-section/visit');
}
