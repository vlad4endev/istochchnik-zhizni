import { query } from '../config/db';
import { sendPush } from './pushService';

type DbRow = Record<string, unknown>;

const SHARE_TOKEN_MAX_AGE_DAYS = Math.min(
  3650,
  Math.max(1, Math.floor(Number(process.env.PUBLIC_SHARE_TOKEN_MAX_AGE_DAYS ?? '365') || 365)),
);

export type SermonFeedbackComment = {
  id: number;
  rating: number | null;
  comment: string;
  created_at: string;
  author_member_id: number;
  author_name: string;
  author_avatar_url: string | null;
};

export type SermonFeedbackContext = {
  service_plan_id: number;
  share_token: string;
  service_date: string;
  start_time: string;
  total_duration_minutes: number;
  preacher_member_id: number | null;
  preacher_name: string | null;
  topic: string;
  scripture: string;
};

export type SermonFeedbackPayload = {
  plan: SermonFeedbackContext & {
    starts_at: string;
    ends_at: string;
    feedback_ends_at: string;
    phase: 'upcoming' | 'live' | 'feedback' | 'closed';
    can_comment: boolean;
  };
  stats: {
    comments_count: number;
    ratings_count: number;
    avg_rating: number | null;
  };
  comments: SermonFeedbackComment[];
};

export type PreacherSermonHistoryRow = {
  service_plan_id: number;
  share_token: string;
  service_date: string;
  start_time: string;
  total_duration_minutes: number;
  topic: string;
  scripture: string;
  comments_count: number;
  ratings_count: number;
  avg_rating: number | null;
};

let schemaInit: Promise<void> | null = null;

function parsePlanStart(serviceDate: string, startTime: string): Date | null {
  const date = String(serviceDate ?? '').trim();
  const time = String(startTime ?? '').trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const dt = new Date(`${date}T${time}:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function computePhase(ctx: SermonFeedbackContext): {
  startsAt: Date | null;
  endsAt: Date | null;
  feedbackEndsAt: Date | null;
  phase: 'upcoming' | 'live' | 'feedback' | 'closed';
} {
  const startsAt = parsePlanStart(ctx.service_date, ctx.start_time);
  if (!startsAt) return { startsAt: null, endsAt: null, feedbackEndsAt: null, phase: 'closed' };
  const duration = Math.max(0, Number(ctx.total_duration_minutes || 0));
  const endsAt = new Date(startsAt.getTime() + duration * 60_000);
  const feedbackEndsAt = new Date(endsAt.getTime() + 5 * 60 * 60_000);
  const now = Date.now();
  if (now < startsAt.getTime()) return { startsAt, endsAt, feedbackEndsAt, phase: 'upcoming' };
  if (now <= endsAt.getTime()) return { startsAt, endsAt, feedbackEndsAt, phase: 'live' };
  if (now <= feedbackEndsAt.getTime()) return { startsAt, endsAt, feedbackEndsAt, phase: 'feedback' };
  return { startsAt, endsAt, feedbackEndsAt, phase: 'closed' };
}

export async function ensureSermonFeedbackSchema(): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      await query(
        `create table if not exists public.service_plan_sermon_feedback_comments (
           id bigserial primary key,
           service_plan_id bigint not null references public.service_plans (id) on delete cascade,
           author_member_id integer not null references public.members (id) on delete cascade,
           rating smallint check (rating between 1 and 5),
           comment text not null default '',
           created_at timestamptz not null default now(),
           updated_at timestamptz not null default now(),
           unique (service_plan_id, author_member_id)
         )`,
      );
      await query(
        `create table if not exists public.service_plan_sermon_feedback_notifications (
           service_plan_id bigint primary key references public.service_plans (id) on delete cascade,
           comments_count integer not null default 0,
           notified_at timestamptz not null default now()
         )`,
      );
      await query(
        `create index if not exists idx_sermon_feedback_comments_plan
         on public.service_plan_sermon_feedback_comments (service_plan_id, created_at desc)`,
      );
    })().catch((e) => {
      schemaInit = null;
      throw e;
    });
  }
  await schemaInit;
}

export async function getSermonFeedbackContextByToken(token: string): Promise<SermonFeedbackContext | null> {
  await ensureSermonFeedbackSchema();
  const normalizedToken = String(token ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(normalizedToken)) return null;
  const res = await query(
    `select
       p.id as service_plan_id,
       p.share_token::text as share_token,
       p.service_date::text as service_date,
       to_char(p.start_time, 'HH24:MI') as start_time,
       p.total_duration_minutes,
       p.preacher_member_id,
       coalesce(
         nullif(trim(concat(coalesce(preacher.first_name, ''), ' ', coalesce(preacher.last_name, ''))), ''),
         preacher.name
       ) as preacher_name,
       sb.topic,
       sb.scripture
     from public.service_plans p
     left join public.members preacher on preacher.id = p.preacher_member_id
     left join lateral (
       select
         trim(coalesce(b.content_json->>'sermon_topic', '')) as topic,
         trim(coalesce(b.content_json->>'sermon_scripture', '')) as scripture
       from public.service_blocks b
       left join public.block_types bt on bt.id = b.block_type_id
       where b.service_plan_id = p.id
         and (
           coalesce(bt.code, '') = 'sermon'
           or lower(coalesce(bt.name, '')) like '%проповед%'
         )
       order by b.order_index asc, b.id asc
       limit 1
     ) sb on true
     where p.status = 'published'
       and p.share_token = $1::uuid
       and p.share_token_issued_at >= now() - ($2::int * interval '1 day')
     limit 1`,
    [normalizedToken, SHARE_TOKEN_MAX_AGE_DAYS],
  );
  const row = res.rows[0] as DbRow | undefined;
  if (!row) return null;
  return {
    service_plan_id: Number(row.service_plan_id),
    share_token: String(row.share_token ?? ''),
    service_date: String(row.service_date ?? ''),
    start_time: String(row.start_time ?? ''),
    total_duration_minutes: Math.max(0, Number(row.total_duration_minutes ?? 0)),
    preacher_member_id: row.preacher_member_id == null ? null : Number(row.preacher_member_id),
    preacher_name: row.preacher_name == null ? null : String(row.preacher_name),
    topic: String(row.topic ?? '').trim(),
    scripture: String(row.scripture ?? '').trim(),
  };
}

export async function listSermonFeedbackComments(servicePlanId: number): Promise<SermonFeedbackComment[]> {
  await ensureSermonFeedbackSchema();
  const res = await query(
    `select
       c.id,
       c.rating,
       c.comment,
       c.created_at::text as created_at,
       c.author_member_id,
       coalesce(
         nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''),
         m.name
       ) as author_name,
       coalesce(up.avatar_url, m.avatar_url) as author_avatar_url
     from public.service_plan_sermon_feedback_comments c
     join public.members m on m.id = c.author_member_id
     left join public.user_profiles up on up.member_id = m.id
     where c.service_plan_id = $1
     order by c.created_at desc, c.id desc`,
    [servicePlanId],
  );
  return res.rows.map((r) => {
    const row = r as DbRow;
    return {
      id: Number(row.id),
      rating: row.rating == null ? null : Number(row.rating),
      comment: String(row.comment ?? ''),
      created_at: String(row.created_at ?? ''),
      author_member_id: Number(row.author_member_id),
      author_name: String(row.author_name ?? 'Участник'),
      author_avatar_url: row.author_avatar_url == null ? null : String(row.author_avatar_url),
    };
  });
}

export async function upsertSermonFeedbackComment(input: {
  token: string;
  authorMemberId: number;
  rating: number;
  comment: string;
}): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'closed' | 'invalid' }> {
  await ensureSermonFeedbackSchema();
  const ctx = await getSermonFeedbackContextByToken(input.token);
  if (!ctx) return { ok: false, reason: 'not_found' };
  if (!ctx.preacher_member_id || !ctx.topic || !ctx.scripture) return { ok: false, reason: 'invalid' };
  const { phase } = computePhase(ctx);
  if (phase !== 'feedback') return { ok: false, reason: 'closed' };
  const rating = Math.max(1, Math.min(5, Math.round(input.rating)));
  const comment = String(input.comment ?? '').trim().slice(0, 4000);
  await query(
    `insert into public.service_plan_sermon_feedback_comments
       (service_plan_id, author_member_id, rating, comment)
     values ($1, $2, $3, $4)
     on conflict (service_plan_id, author_member_id)
     do update set
       rating = excluded.rating,
       comment = excluded.comment,
       updated_at = now()`,
    [ctx.service_plan_id, input.authorMemberId, rating, comment],
  );
  return { ok: true };
}

export async function getSermonFeedbackPayloadByToken(token: string): Promise<SermonFeedbackPayload | null> {
  const ctx = await getSermonFeedbackContextByToken(token);
  if (!ctx) return null;
  if (!ctx.preacher_member_id || !ctx.topic || !ctx.scripture) return null;
  const comments = await listSermonFeedbackComments(ctx.service_plan_id);
  const ratings = comments.map((x) => x.rating).filter((x): x is number => typeof x === 'number');
  const avg = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const { startsAt, endsAt, feedbackEndsAt, phase } = computePhase(ctx);
  return {
    plan: {
      ...ctx,
      starts_at: startsAt ? startsAt.toISOString() : '',
      ends_at: endsAt ? endsAt.toISOString() : '',
      feedback_ends_at: feedbackEndsAt ? feedbackEndsAt.toISOString() : '',
      phase,
      can_comment: phase === 'feedback',
    },
    stats: {
      comments_count: comments.filter((x) => x.comment.trim().length > 0).length,
      ratings_count: ratings.length,
      avg_rating: avg == null ? null : Number(avg.toFixed(2)),
    },
    comments,
  };
}

export async function listPreacherSermonHistory(
  preacherMemberId: number,
  limit = 30,
): Promise<PreacherSermonHistoryRow[]> {
  await ensureSermonFeedbackSchema();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const res = await query(
    `select
       p.id as service_plan_id,
       p.share_token::text as share_token,
       p.service_date::text as service_date,
       to_char(p.start_time, 'HH24:MI') as start_time,
       p.total_duration_minutes,
       sb.topic,
       sb.scripture,
       count(c.id)::int as comments_count,
       count(c.rating)::int as ratings_count,
       avg(c.rating)::numeric(10,2) as avg_rating
     from public.service_plans p
     left join lateral (
       select
         trim(coalesce(b.content_json->>'sermon_topic', '')) as topic,
         trim(coalesce(b.content_json->>'sermon_scripture', '')) as scripture
       from public.service_blocks b
       left join public.block_types bt on bt.id = b.block_type_id
       where b.service_plan_id = p.id
         and (
           coalesce(bt.code, '') = 'sermon'
           or lower(coalesce(bt.name, '')) like '%проповед%'
         )
       order by b.order_index asc, b.id asc
       limit 1
     ) sb on true
     left join public.service_plan_sermon_feedback_comments c on c.service_plan_id = p.id
     where p.status = 'published'
       and p.preacher_member_id = $1
       and coalesce(sb.topic, '') <> ''
       and coalesce(sb.scripture, '') <> ''
     group by p.id, sb.topic, sb.scripture
     order by p.service_date desc, p.start_time desc, p.id desc
     limit $2`,
    [preacherMemberId, safeLimit],
  );
  return res.rows.map((r) => {
    const row = r as DbRow;
    return {
      service_plan_id: Number(row.service_plan_id),
      share_token: String(row.share_token ?? ''),
      service_date: String(row.service_date ?? ''),
      start_time: String(row.start_time ?? ''),
      total_duration_minutes: Math.max(0, Number(row.total_duration_minutes ?? 0)),
      topic: String(row.topic ?? ''),
      scripture: String(row.scripture ?? ''),
      comments_count: Number(row.comments_count ?? 0),
      ratings_count: Number(row.ratings_count ?? 0),
      avg_rating: row.avg_rating == null ? null : Number(row.avg_rating),
    };
  });
}

export async function dispatchDueSermonFeedbackNotifications(): Promise<number> {
  await ensureSermonFeedbackSchema();
  const due = await query(
    `select
       p.id as service_plan_id,
       p.preacher_member_id,
       p.share_token::text as share_token,
       p.service_date::text as service_date,
       sb.topic,
       count(c.id)::int as comments_count
     from public.service_plans p
     join public.service_plan_sermon_feedback_comments c on c.service_plan_id = p.id
     left join public.service_plan_sermon_feedback_notifications n on n.service_plan_id = p.id
     left join lateral (
       select trim(coalesce(b.content_json->>'sermon_topic', '')) as topic
       from public.service_blocks b
       left join public.block_types bt on bt.id = b.block_type_id
       where b.service_plan_id = p.id
         and (
           coalesce(bt.code, '') = 'sermon'
           or lower(coalesce(bt.name, '')) like '%проповед%'
         )
       order by b.order_index asc, b.id asc
       limit 1
     ) sb on true
     where p.status = 'published'
       and p.preacher_member_id is not null
       and n.service_plan_id is null
       and (
         (p.service_date::text || ' ' || to_char(p.start_time, 'HH24:MI'))::timestamp
         + (greatest(0, p.total_duration_minutes) * interval '1 minute')
         + interval '5 hour'
       ) <= now()
     group by p.id, p.preacher_member_id, p.share_token, p.service_date, sb.topic`,
  );
  let sent = 0;
  for (const raw of due.rows) {
    const row = raw as DbRow;
    const planId = Number(row.service_plan_id);
    const preacherMemberId = Number(row.preacher_member_id);
    const commentsCount = Number(row.comments_count ?? 0);
    if (!Number.isFinite(planId) || !Number.isFinite(preacherMemberId) || commentsCount <= 0) continue;
    const topic = String(row.topic ?? '').trim() || 'вашей проповеди';
    const shareToken = String(row.share_token ?? '').trim();
    const serviceDate = String(row.service_date ?? '').trim();
    const dateText = serviceDate
      ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
          new Date(`${serviceDate}T12:00:00`),
        )
      : 'ближайшему собранию';
    try {
      await sendPush(
        preacherMemberId,
        'Новые комментарии к проповеди',
        `${dateText}: по теме "${topic}" оставили комментарии (${commentsCount}).`,
        {
          url: `/service-plan/sermon-comments/${shareToken}`,
          type: 'sermon_feedback_ready',
          service_plan_id: String(planId),
        },
      );
      await query(
        `insert into public.service_plan_sermon_feedback_notifications
           (service_plan_id, comments_count, notified_at)
         values ($1, $2, now())
         on conflict (service_plan_id)
         do update set comments_count = excluded.comments_count, notified_at = excluded.notified_at`,
        [planId, commentsCount],
      );
      sent += 1;
    } catch (e) {
      console.warn('[sermon-feedback] notify preacher failed', { planId, preacherMemberId, e });
    }
  }
  return sent;
}
