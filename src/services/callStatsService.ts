import { query } from '../config/db';
import {
  DEFAULT_CALL_STATUS_LABELS,
  DEFAULT_END_REASON_LABELS,
  type CallStatusId,
} from '../types/callSettings';
import { getCallRuntimeConfig } from './callSettingsService';

export type CallQualityReport = {
  userId: number;
  score: number;
  connectionQuality?: string | null;
  rttMs?: number | null;
  packetLoss?: number | null;
  jitterMs?: number | null;
  at: string;
};

export type CallUsageStatsQuery = {
  from?: string;
  to?: string;
  limit?: number;
  memberId?: number;
  status?: string;
};

export type CallUsageStatsResponse = {
  period: { from: string; to: string };
  summary: {
    total_calls: number;
    active_now: number;
    completed: number;
    missed: number;
    declined: number;
    cancelled: number;
    failed: number;
    avg_duration_sec: number | null;
    total_duration_sec: number;
    avg_quality_score: number | null;
    quality_report_count: number;
    by_media: { audio: number; video: number };
    by_type: { direct: number; group: number };
    by_access: { closed: number; link: number };
  };
  by_day: Array<{ day: string; count: number; avg_duration_sec: number | null; avg_quality: number | null }>;
  by_status: Array<{ status: string; label: string; count: number }>;
  by_end_reason: Array<{ reason: string; label: string; count: number }>;
  top_users: Array<{
    member_id: number;
    name: string;
    avatar_url: string | null;
    calls_initiated: number;
    calls_joined: number;
    total_duration_sec: number;
    avg_quality: number | null;
  }>;
  recent: Array<{
    id: string;
    type: string;
    media_type: string;
    status: string;
    status_label: string;
    access_mode: string;
    title: string | null;
    initiated_by: number;
    initiator_name: string;
    initiator_avatar: string | null;
    conversation_id: string | null;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    end_reason: string | null;
    end_reason_label: string | null;
    quality_score: number | null;
    quality_reports: CallQualityReport[];
    participants: Array<{
      user_id: number;
      name: string;
      avatar_url: string | null;
      role: string;
      status: string;
      joined_at: string | null;
      left_at: string | null;
    }>;
  }>;
};

function parseDayBound(raw: string | undefined, fallback: Date): Date {
  if (!raw || !String(raw).trim()) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

function memberDisplayName(row: {
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
}): string {
  const first = String(row.first_name ?? '').trim();
  const last = String(row.last_name ?? '').trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const name = String(row.name ?? '').trim();
  return name || 'Без имени';
}

function extractQuality(meta: unknown): { score: number | null; reports: CallQualityReport[] } {
  if (!meta || typeof meta !== 'object') return { score: null, reports: [] };
  const q = (meta as Record<string, unknown>).quality;
  if (!q || typeof q !== 'object') return { score: null, reports: [] };
  const qo = q as Record<string, unknown>;
  const score =
    typeof qo.score === 'number' && Number.isFinite(qo.score)
      ? Math.max(0, Math.min(5, qo.score))
      : null;
  const reportsRaw = Array.isArray(qo.reports) ? qo.reports : [];
  const reports: CallQualityReport[] = [];
  for (const item of reportsRaw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const userId = Number(r.userId);
    const s = Number(r.score);
    if (!Number.isFinite(userId) || !Number.isFinite(s)) continue;
    reports.push({
      userId,
      score: Math.max(0, Math.min(5, s)),
      connectionQuality: typeof r.connectionQuality === 'string' ? r.connectionQuality : null,
      rttMs: typeof r.rttMs === 'number' ? r.rttMs : null,
      packetLoss: typeof r.packetLoss === 'number' ? r.packetLoss : null,
      jitterMs: typeof r.jitterMs === 'number' ? r.jitterMs : null,
      at: typeof r.at === 'string' ? r.at : new Date().toISOString(),
    });
  }
  return { score, reports };
}

export async function getCallUsageStats(
  input: CallUsageStatsQuery = {},
): Promise<CallUsageStatsResponse> {
  const runtime = await getCallRuntimeConfig();
  const to = parseDayBound(input.to, new Date());
  const fromDefault = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = parseDayBound(input.from, fromDefault);
  const limit = Math.max(1, Math.min(100, input.limit ?? 40));

  const params: unknown[] = [from.toISOString(), to.toISOString()];
  let extraFilter = '';
  if (input.memberId != null && Number.isFinite(input.memberId)) {
    params.push(input.memberId);
    extraFilter += ` AND (
      c.initiated_by = $${params.length}
      OR EXISTS (
        SELECT 1 FROM call_participants cp
        WHERE cp.call_id = c.id AND cp.user_id = $${params.length}
      )
    )`;
  }
  if (input.status && String(input.status).trim()) {
    params.push(String(input.status).trim());
    extraFilter += ` AND c.status = $${params.length}`;
  }

  const summaryRes = await query(
    `SELECT
       COUNT(*)::int AS total_calls,
       COUNT(*) FILTER (WHERE c.status IN ('ringing','waiting','active'))::int AS active_now,
       COUNT(*) FILTER (WHERE c.status = 'ended')::int AS completed,
       COUNT(*) FILTER (WHERE c.status = 'missed')::int AS missed,
       COUNT(*) FILTER (WHERE c.status = 'declined')::int AS declined,
       COUNT(*) FILTER (WHERE c.status = 'cancelled')::int AS cancelled,
       COUNT(*) FILTER (WHERE c.status = 'failed')::int AS failed,
       AVG(c.duration_seconds) FILTER (WHERE c.duration_seconds IS NOT NULL) AS avg_duration_sec,
       COALESCE(SUM(c.duration_seconds) FILTER (WHERE c.duration_seconds IS NOT NULL), 0)::bigint AS total_duration_sec,
       COUNT(*) FILTER (WHERE c.media_type = 'audio')::int AS media_audio,
       COUNT(*) FILTER (WHERE c.media_type = 'video')::int AS media_video,
       COUNT(*) FILTER (WHERE c.type = 'direct')::int AS type_direct,
       COUNT(*) FILTER (WHERE c.type = 'group')::int AS type_group,
       COUNT(*) FILTER (WHERE c.access_mode = 'closed')::int AS access_closed,
       COUNT(*) FILTER (WHERE c.access_mode = 'link')::int AS access_link
     FROM calls c
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${extraFilter}`,
    params,
  );
  const s = summaryRes.rows[0] ?? {};

  const metaRes = await query(
    `SELECT c.metadata
     FROM calls c
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${extraFilter}`,
    params,
  );
  let qualitySum = 0;
  let qualityCount = 0;
  let qualityReportCount = 0;
  for (const row of metaRes.rows) {
    const { score, reports } = extractQuality(row.metadata);
    qualityReportCount += reports.length;
    if (score != null) {
      qualitySum += score;
      qualityCount += 1;
    }
  }

  const byDayRes = await query(
    `SELECT
       to_char(date_trunc('day', c.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
       COUNT(*)::int AS count,
       AVG(c.duration_seconds) FILTER (WHERE c.duration_seconds IS NOT NULL) AS avg_duration_sec,
       array_agg(c.metadata) AS metas
     FROM calls c
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${extraFilter}
     GROUP BY 1
     ORDER BY 1 ASC`,
    params,
  );
  const by_day = byDayRes.rows.map((row) => {
    const metas = Array.isArray(row.metas) ? row.metas : [];
    let qSum = 0;
    let qN = 0;
    for (const m of metas) {
      const { score } = extractQuality(m);
      if (score != null) {
        qSum += score;
        qN += 1;
      }
    }
    return {
      day: String(row.day),
      count: Number(row.count) || 0,
      avg_duration_sec:
        row.avg_duration_sec != null ? Math.round(Number(row.avg_duration_sec)) : null,
      avg_quality: qN > 0 ? Math.round((qSum / qN) * 10) / 10 : null,
    };
  });

  const byStatusRes = await query(
    `SELECT c.status, COUNT(*)::int AS count
     FROM calls c
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${extraFilter}
     GROUP BY c.status
     ORDER BY count DESC`,
    params,
  );
  const by_status = byStatusRes.rows.map((row) => {
    const status = String(row.status);
    const label =
      runtime.status_labels.call[status as CallStatusId] ||
      DEFAULT_CALL_STATUS_LABELS[status as CallStatusId] ||
      status;
    return { status, label, count: Number(row.count) || 0 };
  });

  const byReasonRes = await query(
    `SELECT COALESCE(c.end_reason, '(none)') AS reason, COUNT(*)::int AS count
     FROM calls c
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
       AND c.ended_at IS NOT NULL
     ${extraFilter}
     GROUP BY 1
     ORDER BY count DESC`,
    params,
  );
  const by_end_reason = byReasonRes.rows.map((row) => {
    const reason = String(row.reason);
    const label =
      reason === '(none)'
        ? 'Без причины'
        : runtime.status_labels.end_reason[reason as keyof typeof runtime.status_labels.end_reason] ||
          DEFAULT_END_REASON_LABELS[reason as keyof typeof DEFAULT_END_REASON_LABELS] ||
          reason;
    return { reason, label, count: Number(row.count) || 0 };
  });

  const topRes = await query(
    `WITH bounds AS (
       SELECT $1::timestamptz AS d_from, $2::timestamptz AS d_to
     ),
     initiated AS (
       SELECT c.initiated_by AS member_id, COUNT(*)::int AS calls_initiated,
              COALESCE(SUM(c.duration_seconds), 0)::bigint AS dur
       FROM calls c, bounds b
       WHERE c.created_at >= b.d_from AND c.created_at <= b.d_to
       GROUP BY c.initiated_by
     ),
     joined AS (
       SELECT cp.user_id AS member_id, COUNT(*)::int AS calls_joined
       FROM call_participants cp
       JOIN calls c ON c.id = cp.call_id
       JOIN bounds b ON TRUE
       WHERE c.created_at >= b.d_from AND c.created_at <= b.d_to
         AND cp.status IN ('joined','left')
       GROUP BY cp.user_id
     ),
     merged AS (
       SELECT
         COALESCE(i.member_id, j.member_id) AS member_id,
         COALESCE(i.calls_initiated, 0) AS calls_initiated,
         COALESCE(j.calls_joined, 0) AS calls_joined,
         COALESCE(i.dur, 0) AS total_duration_sec
       FROM initiated i
       FULL OUTER JOIN joined j ON j.member_id = i.member_id
     )
     SELECT m.member_id, m.calls_initiated, m.calls_joined, m.total_duration_sec,
            mb.first_name, mb.last_name, mb.name, mb.avatar_url
     FROM merged m
     JOIN members mb ON mb.id = m.member_id
     ORDER BY (m.calls_initiated + m.calls_joined) DESC, m.total_duration_sec DESC
     LIMIT 20`,
    [from.toISOString(), to.toISOString()],
  );

  const qualityByUser = new Map<number, { sum: number; n: number }>();
  for (const row of metaRes.rows) {
    const { reports } = extractQuality(row.metadata);
    for (const r of reports) {
      const cur = qualityByUser.get(r.userId) ?? { sum: 0, n: 0 };
      cur.sum += r.score;
      cur.n += 1;
      qualityByUser.set(r.userId, cur);
    }
  }

  const top_users = topRes.rows.map((row) => {
    const memberId = Number(row.member_id);
    const q = qualityByUser.get(memberId);
    return {
      member_id: memberId,
      name: memberDisplayName(row as { first_name?: string; last_name?: string; name?: string }),
      avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
      calls_initiated: Number(row.calls_initiated) || 0,
      calls_joined: Number(row.calls_joined) || 0,
      total_duration_sec: Number(row.total_duration_sec) || 0,
      avg_quality: q && q.n > 0 ? Math.round((q.sum / q.n) * 10) / 10 : null,
    };
  });

  const recentParams = [...params, limit];
  const recentRes = await query(
    `SELECT c.*,
            mb.first_name AS initiator_first_name,
            mb.last_name AS initiator_last_name,
            mb.name AS initiator_name_raw,
            mb.avatar_url AS initiator_avatar
     FROM calls c
     JOIN members mb ON mb.id = c.initiated_by
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${extraFilter}
     ORDER BY c.created_at DESC
     LIMIT $${recentParams.length}`,
    recentParams,
  );

  const callIds = recentRes.rows.map((r) => String(r.id));
  const participantsByCall = new Map<
    string,
    Array<{
      user_id: number;
      name: string;
      avatar_url: string | null;
      role: string;
      status: string;
      joined_at: string | null;
      left_at: string | null;
    }>
  >();

  if (callIds.length > 0) {
    const pRes = await query(
      `SELECT cp.call_id, cp.user_id, cp.role, cp.status, cp.joined_at, cp.left_at,
              mb.first_name, mb.last_name, mb.name, mb.avatar_url
       FROM call_participants cp
       JOIN members mb ON mb.id = cp.user_id
       WHERE cp.call_id = ANY($1::uuid[])
       ORDER BY cp.invited_at ASC`,
      [callIds],
    );
    for (const row of pRes.rows) {
      const callId = String(row.call_id);
      const list = participantsByCall.get(callId) ?? [];
      list.push({
        user_id: Number(row.user_id),
        name: memberDisplayName(row as { first_name?: string; last_name?: string; name?: string }),
        avatar_url: row.avatar_url != null ? String(row.avatar_url) : null,
        role: String(row.role),
        status: String(row.status),
        joined_at: row.joined_at ? new Date(String(row.joined_at)).toISOString() : null,
        left_at: row.left_at ? new Date(String(row.left_at)).toISOString() : null,
      });
      participantsByCall.set(callId, list);
    }
  }

  const recent = recentRes.rows.map((row) => {
    const id = String(row.id);
    const status = String(row.status);
    const endReason = row.end_reason != null ? String(row.end_reason) : null;
    const meta = row.metadata;
    const title =
      meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).title === 'string'
        ? String((meta as Record<string, unknown>).title)
        : null;
    const { score, reports } = extractQuality(meta);
    return {
      id,
      type: String(row.type),
      media_type: String(row.media_type),
      status,
      status_label:
        runtime.status_labels.call[status as CallStatusId] ||
        DEFAULT_CALL_STATUS_LABELS[status as CallStatusId] ||
        status,
      access_mode: String(row.access_mode || 'closed'),
      title,
      initiated_by: Number(row.initiated_by),
      initiator_name: memberDisplayName({
        first_name: row.initiator_first_name as string | null,
        last_name: row.initiator_last_name as string | null,
        name: row.initiator_name_raw as string | null,
      }),
      initiator_avatar: row.initiator_avatar != null ? String(row.initiator_avatar) : null,
      conversation_id: row.conversation_id != null ? String(row.conversation_id) : null,
      created_at: new Date(String(row.created_at)).toISOString(),
      started_at: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
      ended_at: row.ended_at ? new Date(String(row.ended_at)).toISOString() : null,
      duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
      end_reason: endReason,
      end_reason_label: endReason
        ? runtime.status_labels.end_reason[endReason as keyof typeof runtime.status_labels.end_reason] ||
          DEFAULT_END_REASON_LABELS[endReason as keyof typeof DEFAULT_END_REASON_LABELS] ||
          endReason
        : null,
      quality_score: score,
      quality_reports: reports,
      participants: participantsByCall.get(id) ?? [],
    };
  });

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      total_calls: Number(s.total_calls) || 0,
      active_now: Number(s.active_now) || 0,
      completed: Number(s.completed) || 0,
      missed: Number(s.missed) || 0,
      declined: Number(s.declined) || 0,
      cancelled: Number(s.cancelled) || 0,
      failed: Number(s.failed) || 0,
      avg_duration_sec:
        s.avg_duration_sec != null ? Math.round(Number(s.avg_duration_sec)) : null,
      total_duration_sec: Number(s.total_duration_sec) || 0,
      avg_quality_score:
        qualityCount > 0 ? Math.round((qualitySum / qualityCount) * 10) / 10 : null,
      quality_report_count: qualityReportCount,
      by_media: {
        audio: Number(s.media_audio) || 0,
        video: Number(s.media_video) || 0,
      },
      by_type: {
        direct: Number(s.type_direct) || 0,
        group: Number(s.type_group) || 0,
      },
      by_access: {
        closed: Number(s.access_closed) || 0,
        link: Number(s.access_link) || 0,
      },
    },
    by_day,
    by_status,
    by_end_reason,
    top_users,
    recent,
  };
}
