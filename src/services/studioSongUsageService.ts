import { query } from '../config/db';

const SONG_BLOCK_FROM = `
  FROM public.service_blocks b
  INNER JOIN public.block_types bt ON bt.id = b.block_type_id
  INNER JOIN public.service_plans sp ON sp.id = b.service_plan_id
  INNER JOIN public.songs s ON s.id = b.song_id
`;

function songBlockWhere(periodFilter: string): string {
  return `WHERE lower(coalesce(bt.code, '')) = 'song'
    AND b.song_id IS NOT NULL
    AND coalesce(sp.is_archived, false) = false
    ${periodFilter}`;
}

const LEADER_NAME_SQL = `coalesce(
  nullif(trim(concat(coalesce(leader.first_name, ''), ' ', coalesce(leader.last_name, ''))), ''),
  leader.name
)`;

export type ServicePlanSongUsageItem = {
  song_id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  usage_count: number;
  last_used_date: string | null;
  first_used_date: string | null;
};

export type ServicePlanSongRecentUsage = {
  song_id: number;
  title: string;
  song_number: number | null;
  default_key: string | null;
  service_plan_id: number;
  service_date: string;
  plan_status: string;
  leader_name: string | null;
};

export type ServicePlanSongUsageReport = {
  period_months: number | null;
  stats: {
    services_with_songs: number;
    total_song_slots: number;
    unique_songs: number;
    avg_songs_per_service: number;
  };
  top_songs: ServicePlanSongUsageItem[];
  recent_usages: ServicePlanSongRecentUsage[];
  /** Пели раньше, но не в выбранном периоде (только если период ограничен). */
  stale_songs: ServicePlanSongUsageItem[];
};

function mapUsageItem(row: Record<string, unknown>): ServicePlanSongUsageItem {
  return {
    song_id: Number(row.song_id),
    title: String(row.title ?? ''),
    song_number: row.song_number == null ? null : Number(row.song_number),
    default_key: row.default_key == null ? null : String(row.default_key),
    usage_count: Number(row.usage_count ?? 0),
    last_used_date: row.last_used_date == null ? null : String(row.last_used_date),
    first_used_date: row.first_used_date == null ? null : String(row.first_used_date),
  };
}

function mapRecent(row: Record<string, unknown>): ServicePlanSongRecentUsage {
  return {
    song_id: Number(row.song_id),
    title: String(row.title ?? ''),
    song_number: row.song_number == null ? null : Number(row.song_number),
    default_key: row.default_key == null ? null : String(row.default_key),
    service_plan_id: Number(row.service_plan_id),
    service_date: String(row.service_date ?? ''),
    plan_status: String(row.plan_status ?? ''),
    leader_name: row.leader_name == null ? null : String(row.leader_name),
  };
}

function periodStartDate(months: number | null): string | null {
  if (months == null || months <= 0) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

export async function getServicePlanSongUsageReport(
  periodMonths: number | null,
): Promise<ServicePlanSongUsageReport> {
  const since = periodStartDate(periodMonths);
  const periodFilter = since ? `AND sp.service_date >= $1::date` : '';
  const params = since ? [since] : [];
  const whereClause = songBlockWhere(periodFilter);

  const statsRes = await query(
    `SELECT
       count(distinct sp.id)::int AS services_with_songs,
       count(*)::int AS total_song_slots,
       count(distinct s.id)::int AS unique_songs
     ${SONG_BLOCK_FROM}
     ${whereClause}`,
    params,
  );
  const statsRow = statsRes.rows[0] as Record<string, unknown> | undefined;
  const servicesWithSongs = Number(statsRow?.services_with_songs ?? 0);
  const totalSongSlots = Number(statsRow?.total_song_slots ?? 0);
  const uniqueSongs = Number(statsRow?.unique_songs ?? 0);
  const avgSongsPerService =
    servicesWithSongs > 0 ? Math.round((totalSongSlots / servicesWithSongs) * 10) / 10 : 0;

  const topRes = await query(
    `SELECT
       s.id AS song_id,
       s.title,
       s.song_number,
       s.default_key,
       count(*)::int AS usage_count,
       max(sp.service_date)::text AS last_used_date,
       min(sp.service_date)::text AS first_used_date
     ${SONG_BLOCK_FROM}
     ${whereClause}
     GROUP BY s.id, s.title, s.song_number, s.default_key
     ORDER BY usage_count DESC, last_used_date DESC, s.title ASC
     LIMIT 25`,
    params,
  );

  const recentRes = await query(
    `SELECT
       s.id AS song_id,
       s.title,
       s.song_number,
       s.default_key,
       sp.id AS service_plan_id,
       sp.service_date::text AS service_date,
       sp.status AS plan_status,
       ${LEADER_NAME_SQL} AS leader_name
     ${SONG_BLOCK_FROM}
     LEFT JOIN public.members leader ON leader.id = sp.leader_member_id
     ${whereClause}
     ORDER BY sp.service_date DESC, b.order_index ASC, b.id ASC
     LIMIT 40`,
    params,
  );

  let staleSongs: ServicePlanSongUsageItem[] = [];
  if (since) {
    const baseWhere = songBlockWhere('');
    const staleRes = await query(
      `WITH all_time AS (
         SELECT
           s.id AS song_id,
           s.title,
           s.song_number,
           s.default_key,
           count(*)::int AS usage_count,
           max(sp.service_date)::text AS last_used_date,
           min(sp.service_date)::text AS first_used_date
         ${SONG_BLOCK_FROM}
         ${baseWhere}
         GROUP BY s.id, s.title, s.song_number, s.default_key
       ),
       in_period AS (
         SELECT distinct s.id AS song_id
         ${SONG_BLOCK_FROM}
         ${songBlockWhere('AND sp.service_date >= $1::date')}
       )
       SELECT a.*
       FROM all_time a
       LEFT JOIN in_period p ON p.song_id = a.song_id
       WHERE p.song_id IS NULL
       ORDER BY a.last_used_date ASC NULLS LAST, a.title ASC
       LIMIT 15`,
      [since],
    );
    staleSongs = staleRes.rows.map((row) => mapUsageItem(row as Record<string, unknown>));
  }

  return {
    period_months: periodMonths,
    stats: {
      services_with_songs: servicesWithSongs,
      total_song_slots: totalSongSlots,
      unique_songs: uniqueSongs,
      avg_songs_per_service: avgSongsPerService,
    },
    top_songs: topRes.rows.map((row) => mapUsageItem(row as Record<string, unknown>)),
    recent_usages: recentRes.rows.map((row) => mapRecent(row as Record<string, unknown>)),
    stale_songs: staleSongs,
  };
}
