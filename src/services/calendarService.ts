import { query } from '../config/db';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseIsoDateToUtc(dateValue: string): Date {
  const match = ISO_DATE_PATTERN.exec(dateValue);
  if (!match) {
    throw new Error('Invalid date format');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  // Guard against impossible dates like 2026-02-31.
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error('Invalid date value');
  }

  return utcDate;
}

function getDiffDays(targetDate: string, startDate: string): number {
  const start = parseIsoDateToUtc(startDate);
  const target = parseIsoDateToUtc(targetDate);
  const diffTime = target.getTime() - start.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

interface Member {
  id: number;
  name: string;
  prayer_request: string | null;
}

interface MemberOverrideRow {
  id: number;
  name: string;
  prayer_request: string | null;
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
}

export interface NextWeekMemberAssignment {
  date: string;
  member: Member | null;
}

async function getCycleStartDate(): Promise<string> {
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`
  );

  const result = await query('SELECT start_date::text FROM global_settings WHERE id = 1');

  return (result.rows[0] as { start_date?: string } | undefined)?.start_date ??
    new Date().toISOString().slice(0, 10);
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getNextWeekDates(): string[] {
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = todayUtc.getUTCDay(); // 0=Sun ... 6=Sat
  const daysUntilNextMonday = day === 1 ? 7 : ((8 - day) % 7);
  const nextMonday = addUtcDays(todayUtc, daysUntilNextMonday);

  return Array.from({ length: 7 }, (_, index) => formatUtcDate(addUtcDays(nextMonday, index)));
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

export async function getPrayerDataByDate(
  targetDate: string
): Promise<PrayerDataByDate> {
  const cycleStartDate = await getCycleStartDate();
  const diffDays = getDiffDays(targetDate, cycleStartDate);

  const [membersCount, themesCount, ministriesCount, backslidersCount] =
    await Promise.all([
      query('SELECT COUNT(*)::int FROM members WHERE is_active = TRUE'),
      query('SELECT COUNT(*)::int FROM global_themes'),
      query('SELECT COUNT(*)::int FROM ministries'),
      query('SELECT COUNT(*)::int FROM backsliders'),
    ]);

  const totalMembers = membersCount.rows[0]?.count ?? 0;
  const totalThemes = themesCount.rows[0]?.count ?? 0;
  const totalMinistries = ministriesCount.rows[0]?.count ?? 0;
  const totalBacksliders = backslidersCount.rows[0]?.count ?? 0;

  const memberIndex = totalMembers > 0 ? ((diffDays % totalMembers) + totalMembers) % totalMembers : 0;
  const themeIndex = totalThemes > 0 ? ((diffDays % totalThemes) + totalThemes) % totalThemes : 0;
  const ministryIndex = totalMinistries > 0 ? ((diffDays % totalMinistries) + totalMinistries) % totalMinistries : 0;
  const backsliderIndex = totalBacksliders > 0 ? ((diffDays % totalBacksliders) + totalBacksliders) % totalBacksliders : 0;

  const overridePromise = query(
    `SELECT m.id, m.name, m.prayer_request
     FROM member_cycle_overrides o
     JOIN members m ON m.id = o.member_id
     WHERE m.is_active = TRUE
       AND
       o.target_date = $1::date
     LIMIT 1`,
    [targetDate]
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
      `SELECT id, name, prayer_request
       FROM members
       WHERE is_active = TRUE
       ORDER BY
         LOWER(COALESCE(NULLIF(trim(last_name), ''), split_part(trim(name), ' ', 1))) ASC,
         LOWER(COALESCE(NULLIF(trim(first_name), ''), name)) ASC,
         id ASC
       LIMIT 1 OFFSET $1`,
      [memberIndex]
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
  };
}

export async function getNextWeekMemberAssignments(): Promise<NextWeekMemberAssignment[]> {
  const dates = getNextWeekDates();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  const cycleStartDate = await getCycleStartDate();
  const totalMembersResult = await query('SELECT COUNT(*)::int AS count FROM members WHERE is_active = TRUE');
  const totalMembers = totalMembersResult.rows[0]?.count ?? 0;

  if (totalMembers <= 0) {
    return dates.map((date) => ({ date, member: null }));
  }

  const sortedMembers = await query(
    `SELECT id, name, prayer_request
     FROM members
     WHERE is_active = TRUE
     ORDER BY
       LOWER(COALESCE(NULLIF(trim(last_name), ''), split_part(trim(name), ' ', 1))) ASC,
       LOWER(COALESCE(NULLIF(trim(first_name), ''), name)) ASC,
       id ASC`
  ).then((result) => result.rows as Member[]);

  const overrides = await query(
    `SELECT o.target_date::text AS target_date, m.id, m.name, m.prayer_request
     FROM member_cycle_overrides o
     JOIN members m ON m.id = o.member_id
     WHERE m.is_active = TRUE
       AND o.target_date BETWEEN $1::date AND $2::date`,
    [firstDate, lastDate]
  );

  const overrideByDate = new Map<string, Member>();
  for (const row of overrides.rows) {
    const targetDate = (row as { target_date?: string }).target_date;
    if (!targetDate) {
      continue;
    }
    overrideByDate.set(targetDate, {
      id: Number((row as { id: number }).id),
      name: String((row as { name: string }).name),
      prayer_request: (row as { prayer_request?: string | null }).prayer_request ?? null,
    });
  }

  return dates.map((date) => {
    const overrideMember = overrideByDate.get(date);
    if (overrideMember) {
      return { date, member: overrideMember };
    }

    const diffDays = getDiffDays(date, cycleStartDate);
    const index = ((diffDays % totalMembers) + totalMembers) % totalMembers;
    return {
      date,
      member: sortedMembers[index] ?? null,
    };
  });
}
