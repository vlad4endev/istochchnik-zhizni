import { query } from '../config/db';
import { getDiffDays } from '../utils/isoDates';
import {
  computeCycleIndex,
  getCycleStartDate,
  getPrayerCycleSnapshotForDate,
  PRAYER_CYCLE_MEMBERS_WHERE,
  PRAYER_CYCLE_MEMBERS_WHERE_M,
  toPublicCycleInfo,
  type PrayerCyclePublic,
} from './prayerCycleService';

interface Member {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  prayer_request: string | null;
  /** Когда последний раз меняли молитвенную нужду для этого цикла (member_prayer_by_cycle). */
  prayer_need_updated_at: string | null;
  previous_manual_prayer_needs?: Array<{
    id: number;
    note: string;
    created_at: string;
    /** Ручные заметки координатора; journal — та же выборка, что в «Истории молитвенных записок» у участника. */
    source?: 'manual' | 'journal';
  }>;
}

interface MemberOverrideRow {
  id: number;
  name: string;
  first_name: string | null;
  last_name: string | null;
  prayer_request: string | null;
  prayer_need_updated_at: string | null;
}

interface GlobalTheme {
  id: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
}

interface Ministry {
  id: number;
  title: string;
  prayer_points: string | null;
}

interface Backslider {
  id: number;
  name: string;
}

export interface PrayerDataByDate {
  date: string;
  diffDays: number;
  members: Member[];
  global_themes: GlobalTheme[];
  ministries: Ministry[];
  backsliders: Backslider[];
  /** Молитвенный цикл для этой даты (один полный круг по участникам с флагом «в цикле» = member_count дней). */
  prayer_cycle: PrayerCyclePublic | null;
}

export interface NextWeekMemberAssignment {
  date: string;
  member: Member | null;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Семь дат пн–вс следующей календарной недели (от следующего понедельника). */
export function getNextWeekDates(): string[] {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = todayUtc.getUTCDay(); // 0=Sun ... 6=Sat
  const daysUntilNextMonday = day === 1 ? 7 : ((8 - day) % 7);
  const nextMonday = addUtcDays(todayUtc, daysUntilNextMonday);

  return Array.from({ length: 7 }, (_, index) => formatUtcDate(addUtcDays(nextMonday, index)));
}

/** Семь дат пн–вс текущей календарной недели (включая сегодня). */
export function getCurrentWeekDates(): string[] {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = todayUtc.getUTCDay(); // 0=Sun ... 6=Sat
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = addUtcDays(todayUtc, -daysFromMonday);
  return Array.from({ length: 7 }, (_, index) => formatUtcDate(addUtcDays(monday, index)));
}

async function getByIndex<T>(
  table: string,
  index: number,
  orderColumn = 'id'
): Promise<T[]> {
  const result = await query(
    `SELECT * FROM ${table} ORDER BY ${orderColumn} LIMIT 1 OFFSET $1`,
    [index]
  );
  return result.rows as T[];
}

/** Порядок участников в цикле: А–Я по имени, затем по фамилии (как в админке). */
const MEMBER_ORDER_SQL = `LOWER(COALESCE(NULLIF(trim(m.first_name), ''), split_part(trim(m.name), ' ', 1))) ASC,
    LOWER(COALESCE(NULLIF(trim(m.last_name), ''), NULLIF(trim(split_part(trim(m.name), ' ', 2)), ''), trim(m.name))) ASC,
    m.id ASC`;

function isPgMissingTableOrColumn(e: unknown): boolean {
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code ?? '') : '';
  return code === '42P01' || code === '42703';
}

type PreviousNeedItem = {
  id: number;
  note: string;
  created_at: string;
  source: 'manual' | 'journal';
};

function parsePreviousNeedId(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^-?\d+$/.test(raw.trim())) return Number(raw.trim());
  return NaN;
}

/** Ручные заметки координаторов + записи из журнала истории (как в профиле участника). */
async function attachManualPreviousPrayerNeedsToMembers(members: Member[]): Promise<void> {
  const ids = members.map((m) => m.id).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return;

  const byManual = new Map<number, PreviousNeedItem[]>();
  try {
    const prevNeeds = await query(
      `SELECT
         ranked.member_id,
         ranked.id,
         ranked.note,
         ranked.created_at
       FROM (
         SELECT
           p.member_id,
           p.id,
           p.note,
           p.created_at::text AS created_at,
           ROW_NUMBER() OVER (
             PARTITION BY p.member_id
             ORDER BY p.created_at DESC, p.id DESC
           ) AS rn
         FROM member_previous_prayer_needs_manual p
         WHERE p.member_id = ANY($1::int[])
           AND NULLIF(TRIM(COALESCE(p.note, '')), '') IS NOT NULL
       ) AS ranked
       WHERE ranked.rn <= 8
       ORDER BY ranked.member_id ASC, ranked.created_at DESC`,
      [ids],
    );

    for (const row of prevNeeds.rows as Array<{
      member_id: unknown;
      id: unknown;
      note: unknown;
      created_at: unknown;
    }>) {
      const mid = Number(row.member_id);
      const nid = parsePreviousNeedId(row.id);
      if (!Number.isFinite(mid) || !Number.isFinite(nid)) continue;
      const note = String(row.note ?? '').trim();
      if (!note) continue;
      const arr = byManual.get(mid) ?? [];
      arr.push({
        id: nid,
        note,
        created_at: String(row.created_at),
        source: 'manual',
      });
      byManual.set(mid, arr);
    }
  } catch (e) {
    if (!isPgMissingTableOrColumn(e)) {
      throw e;
    }
  }

  const byJournal = new Map<number, PreviousNeedItem[]>();
  try {
    const hist = await query(
      `SELECT member_id, id, note, created_at FROM (
         SELECT h.member_id,
                h.id::bigint AS id,
                trim(h.prayer_request) AS note,
                h.created_at::text AS created_at
           FROM member_prayer_request_history h
          WHERE h.member_id = ANY($1::int[])
            AND NULLIF(trim(h.prayer_request), '') IS NOT NULL
         UNION ALL
         SELECT mpc.member_id,
                (-(mpc.cycle_index + 1))::bigint AS id,
                trim(mpc.prayer_request) AS note,
                mpc.updated_at::text AS created_at
           FROM member_prayer_by_cycle mpc
          WHERE mpc.member_id = ANY($1::int[])
            AND NULLIF(trim(mpc.prayer_request), '') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
                FROM member_prayer_request_history h2
               WHERE h2.member_id = mpc.member_id
                 AND h2.cycle_index IS NOT DISTINCT FROM mpc.cycle_index
            )
       ) sub
       ORDER BY member_id ASC, created_at DESC`,
      [ids],
    );

    const rankByMember = new Map<number, number>();
    for (const row of hist.rows as Array<{
      member_id: unknown;
      id: unknown;
      note: unknown;
      created_at: unknown;
    }>) {
      const mid = Number(row.member_id);
      const nid = parsePreviousNeedId(row.id);
      if (!Number.isFinite(mid) || !Number.isFinite(nid)) continue;
      const note = String(row.note ?? '').trim();
      if (!note) continue;
      const r = (rankByMember.get(mid) ?? 0) + 1;
      rankByMember.set(mid, r);
      if (r > 15) continue;
      const arr = byJournal.get(mid) ?? [];
      arr.push({
        id: nid,
        note,
        created_at: String(row.created_at),
        source: 'journal',
      });
      byJournal.set(mid, arr);
    }
  } catch (e) {
    if (!isPgMissingTableOrColumn(e)) {
      throw e;
    }
  }

  for (const m of members) {
    const manual = byManual.get(m.id) ?? [];
    const journal = byJournal.get(m.id) ?? [];
    const combined: PreviousNeedItem[] = [...manual, ...journal];
    combined.sort((a, b) => {
      const t = b.created_at.localeCompare(a.created_at);
      return t !== 0 ? t : b.id - a.id;
    });
    const seen = new Set<string>();
    const deduped: PreviousNeedItem[] = [];
    for (const row of combined) {
      const key = `${row.source}|${row.note}|${row.created_at.slice(0, 19)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
      if (deduped.length >= 12) break;
    }
    m.previous_manual_prayer_needs = deduped;
  }
}

export async function getPrayerDataByDate(targetDate: string): Promise<PrayerDataByDate> {
  const cycleStartDate = await getCycleStartDate();
  const diffDays = getDiffDays(targetDate, cycleStartDate);

  const [membersCount, themesCount, ministriesCount, backslidersCount, cycleSnap] =
    await Promise.all([
      query(`SELECT COUNT(*)::int FROM members WHERE ${PRAYER_CYCLE_MEMBERS_WHERE}`),
      query('SELECT COUNT(*)::int FROM global_themes'),
      query('SELECT COUNT(*)::int FROM ministries'),
      query('SELECT COUNT(*)::int FROM backsliders'),
      getPrayerCycleSnapshotForDate(targetDate),
    ]);

  const totalMembers = membersCount.rows[0]?.count ?? 0;
  const totalThemes = themesCount.rows[0]?.count ?? 0;
  const totalMinistries = ministriesCount.rows[0]?.count ?? 0;
  const totalBacksliders = backslidersCount.rows[0]?.count ?? 0;

  const memberIndex =
    totalMembers > 0 ? ((diffDays % totalMembers) + totalMembers) % totalMembers : 0;
  const themeIndex = totalThemes > 0 ? ((diffDays % totalThemes) + totalThemes) % totalThemes : 0;
  const ministryIndex =
    totalMinistries > 0 ? ((diffDays % totalMinistries) + totalMinistries) % totalMinistries : 0;
  const backsliderIndex =
    totalBacksliders > 0 ? ((diffDays % totalBacksliders) + totalBacksliders) % totalBacksliders : 0;

  const cycleIndexForDate =
    totalMembers > 0 ? computeCycleIndex(diffDays, totalMembers) : 0;

  const overridePromise = query(
    `SELECT m.id, m.name, m.first_name, m.last_name,
            COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
            mpc.updated_at::text AS prayer_need_updated_at
     FROM member_cycle_overrides o
     JOIN members m ON m.id = o.member_id
     LEFT JOIN member_prayer_by_cycle mpc
       ON mpc.member_id = m.id AND mpc.cycle_index = $2
     WHERE m.is_active = TRUE
       AND m.in_prayer_cycle = TRUE
       AND o.target_date = $1::date
     LIMIT 1`,
    [targetDate, cycleIndexForDate]
  ).then((result) => (result.rows[0] as MemberOverrideRow | undefined) ?? null);

  const membersPromise = (async (): Promise<Member[]> => {
    if (totalMembers <= 0) {
      return [];
    }

    const overrideMember = await overridePromise;
    if (overrideMember != null) {
      return [overrideMember];
    }

    const result = await query(
      `SELECT m.id, m.name, m.first_name, m.last_name,
              COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
              mpc.updated_at::text AS prayer_need_updated_at
       FROM members m
       LEFT JOIN member_prayer_by_cycle mpc
         ON mpc.member_id = m.id AND mpc.cycle_index = $2
       WHERE ${PRAYER_CYCLE_MEMBERS_WHERE_M}
       ORDER BY ${MEMBER_ORDER_SQL}
       LIMIT 1 OFFSET $1`,
      [memberIndex, cycleIndexForDate]
    );
    return result.rows as Member[];
  })();

  const [members, global_themes, ministries, backsliders] = await Promise.all([
    membersPromise,
    totalThemes > 0 ? getByIndex<GlobalTheme>('global_themes', themeIndex) : Promise.resolve([]),
    totalMinistries > 0 ? getByIndex<Ministry>('ministries', ministryIndex) : Promise.resolve([]),
    totalBacksliders > 0 ? getByIndex<Backslider>('backsliders', backsliderIndex) : Promise.resolve([]),
  ]);

  return {
    date: targetDate,
    diffDays,
    members,
    global_themes,
    ministries,
    backsliders,
    prayer_cycle: cycleSnap ? toPublicCycleInfo(cycleSnap) : null,
  };
}

export type WeekPlanKind = 'current' | 'next';

/** Понедельник выбранной календарной недели — та же привязка, что у `/api/calendar/next-week/members?week=`. */
export function getCalendarWeekStartDate(kind: WeekPlanKind): string {
  const dates = kind === 'next' ? getNextWeekDates() : getCurrentWeekDates();
  return dates[0] ?? new Date().toISOString().slice(0, 10);
}

export async function getMemberAssignmentsForWeek(kind: WeekPlanKind): Promise<NextWeekMemberAssignment[]> {
  const dates = kind === 'next' ? getNextWeekDates() : getCurrentWeekDates();
  return getMemberAssignmentsForDates(dates);
}

export async function getNextWeekMemberAssignments(): Promise<NextWeekMemberAssignment[]> {
  return getMemberAssignmentsForWeek('next');
}

async function getMemberAssignmentsForDates(dates: string[]): Promise<NextWeekMemberAssignment[]> {
  if (dates.length === 0) {
    return [];
  }
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const cycleStartDate = await getCycleStartDate();
  const totalMembersResult = await query(
    `SELECT COUNT(*)::int AS count FROM members WHERE ${PRAYER_CYCLE_MEMBERS_WHERE}`,
  );
  const totalMembers = totalMembersResult.rows[0]?.count ?? 0;

  if (totalMembers <= 0) {
    return dates.map((date) => ({ date, member: null }));
  }

  const sortedBase = await query(
    `SELECT m.id, m.name, m.first_name, m.last_name
     FROM members m
     WHERE ${PRAYER_CYCLE_MEMBERS_WHERE_M}
     ORDER BY ${MEMBER_ORDER_SQL}`
  ).then((result) => result.rows as { id: number; name: string; first_name: string | null; last_name: string | null }[]);

  const overrides = await query(
    `SELECT o.target_date::text AS target_date, m.id
     FROM member_cycle_overrides o
     JOIN members m ON m.id = o.member_id
     WHERE m.is_active = TRUE
       AND m.in_prayer_cycle = TRUE
       AND o.target_date BETWEEN $1::date AND $2::date`,
    [firstDate, lastDate]
  );

  const overrideByDate = new Map<string, Member>();
  for (const row of overrides.rows) {
    const targetDate = (row as { target_date?: string }).target_date;
    const memberId = Number((row as { id: number }).id);
    if (!targetDate || !Number.isFinite(memberId)) {
      continue;
    }
    const diffD = getDiffDays(targetDate, cycleStartDate);
    const cIdx = computeCycleIndex(diffD, totalMembers);
    const r = await query(
      `SELECT m.id, m.name, m.first_name, m.last_name,
              COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
              mpc.updated_at::text AS prayer_need_updated_at
       FROM members m
       LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = $2
       WHERE m.id = $1`,
      [memberId, cIdx]
    );
    const enriched = r.rows[0] as Member | undefined;
    if (enriched) {
      overrideByDate.set(targetDate, enriched);
    }
  }

  const out: NextWeekMemberAssignment[] = [];

  for (const date of dates) {
    const overrideMember = overrideByDate.get(date);
    if (overrideMember) {
      out.push({ date, member: overrideMember });
      continue;
    }

    const diffDays = getDiffDays(date, cycleStartDate);
    const index = ((diffDays % totalMembers) + totalMembers) % totalMembers;
    const cIdx = computeCycleIndex(diffDays, totalMembers);
    const base = sortedBase[index];
    if (!base) {
      out.push({ date, member: null });
      continue;
    }

    const pr = await query(
      `SELECT COALESCE(mpc.prayer_request, m.prayer_request) AS prayer_request,
              mpc.updated_at::text AS prayer_need_updated_at
       FROM members m
       LEFT JOIN member_prayer_by_cycle mpc ON mpc.member_id = m.id AND mpc.cycle_index = $2
       WHERE m.id = $1`,
      [base.id, cIdx]
    );
    const row = pr.rows[0] as { prayer_request?: string | null; prayer_need_updated_at?: string | null } | undefined;
    const prayerRequest = row?.prayer_request ?? null;
    const updatedAt = row?.prayer_need_updated_at ?? null;
    out.push({
      date,
      member: {
        id: base.id,
        name: base.name,
        first_name: base.first_name,
        last_name: base.last_name,
        prayer_request: prayerRequest,
        prayer_need_updated_at: updatedAt,
      },
    });
  }

  const membersOnly = out.map((r) => r.member).filter((m): m is Member => m != null);
  await attachManualPreviousPrayerNeedsToMembers(membersOnly);

  return out;
}
