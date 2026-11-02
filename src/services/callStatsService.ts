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
  by_status: Array<{ status: string; label: string; count: number }>;
  by_end_reason: Array<{ reason: string; label: string; count: number }>;
};

function parseDayBound(raw: string | undefined, fallback: Date): Date {
  if (!raw || !String(raw).trim()) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export function memberDisplayName(row: {
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

export function extractQuality(meta: unknown): { score: number | null; reports: CallQualityReport[] } {
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
    by_status,
    by_end_reason,
  };
}
