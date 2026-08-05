import { query } from '../config/db';
import { addCalendarDaysYmd, formatYmdInTimeZone } from '../utils/zonedTime';
import {
  formatSundayMailingHeading,
  normalizeSermonFieldValue,
} from './servicePlanMondayMailingService';
import { ensureSundayScheduleSlotsSchema } from './sundayScheduleSlots';
import { sendTelegramToChat } from './telegramService';

const DEFAULT_TZ = 'Europe/Moscow';
const DEFAULT_PUBLIC_ORIGIN = 'https://app.church-tambov.ru';
/** ~1.5 недели до воскресенья с проповедью. */
const DEFAULT_DAYS_BEFORE = 11;

type DbRow = Record<string, unknown>;

export type PreacherSermonDataReminderCandidate = {
  service_date: string;
  preacher_member_id: number;
  preacher_name: string;
  telegram_chat_id: string;
  service_plan_id: number | null;
  share_token: string | null;
  sermon_topic: string;
  sermon_scripture: string;
};

let schemaInit: Promise<void> | null = null;

export async function ensurePreacherSermonDataReminderSchema(): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      await query(
        `create table if not exists public.preacher_sermon_data_reminders (
           id bigserial primary key,
           service_date date not null,
           preacher_member_id integer not null references public.members (id) on delete cascade,
           service_plan_id bigint references public.service_plans (id) on delete set null,
           channel varchar(20) not null default 'telegram',
           notified_at timestamptz not null default now(),
           unique (service_date, preacher_member_id, channel)
         )`,
      );
      await query(
        `create index if not exists idx_preacher_sermon_data_reminders_date
         on public.preacher_sermon_data_reminders (service_date)`,
      );
      await query(
        `create index if not exists idx_preacher_sermon_data_reminders_member
         on public.preacher_sermon_data_reminders (preacher_member_id)`,
      );
    })().catch((e) => {
      schemaInit = null;
      throw e;
    });
  }
  await schemaInit;
}

export function resolvePreacherReminderDaysBefore(): number {
  const raw = Number(process.env.PREACHER_SERMON_DATA_REMINDER_DAYS_BEFORE ?? DEFAULT_DAYS_BEFORE);
  if (!Number.isFinite(raw)) return DEFAULT_DAYS_BEFORE;
  return Math.max(1, Math.min(60, Math.floor(raw)));
}

export function resolvePreacherReminderTargetDateYmd(
  now: Date = new Date(),
  timeZone: string = DEFAULT_TZ,
  daysBefore: number = resolvePreacherReminderDaysBefore(),
): string {
  const todayYmd = formatYmdInTimeZone(timeZone, now);
  return addCalendarDaysYmd(timeZone, todayYmd, daysBefore);
}

function resolvePublicWebOrigin(): string {
  const fromEnv =
    (typeof process.env.PUBLIC_WEB_ORIGIN === 'string' && process.env.PUBLIC_WEB_ORIGIN.trim()) ||
    (typeof process.env.PUBLIC_APP_URL === 'string' && process.env.PUBLIC_APP_URL.trim()) ||
    '';
  if (!fromEnv) return DEFAULT_PUBLIC_ORIGIN;
  return fromEnv.replace(/\/+$/, '');
}

export function buildPreacherSermonDataReminderText(input: {
  serviceDateYmd: string;
  preacherName?: string | null;
  shareUrl?: string | null;
}): string {
  const heading = formatSundayMailingHeading(input.serviceDateYmd);
  const name = String(input.preacherName ?? '').trim();
  const greeting = name ? `${name}, напоминание` : 'Напоминание';
  const lines = [
    `${greeting}: вы проповедуете в ${heading}.`,
    '',
    'Пожалуйста, внесите данные по проповеди в программу служения на эту дату: тему, тезисы и тексты Писания. Если есть презентация — загрузите файл в блок проповеди.',
  ];
  const shareUrl = String(input.shareUrl ?? '').trim();
  if (shareUrl) {
    lines.push('', `Ссылка на программу: ${shareUrl}`);
  }
  return lines.join('\n');
}

export function isSermonDataComplete(topic: string | null | undefined, scripture: string | null | undefined): boolean {
  return Boolean(normalizeSermonFieldValue(topic) && normalizeSermonFieldValue(scripture));
}

function mapCandidate(row: DbRow): PreacherSermonDataReminderCandidate | null {
  const preacherMemberId = Number(row.preacher_member_id);
  const chatId = String(row.telegram_chat_id ?? '').trim();
  const serviceDate = String(row.service_date ?? '').trim().slice(0, 10);
  if (!Number.isInteger(preacherMemberId) || preacherMemberId <= 0 || !chatId || !serviceDate) {
    return null;
  }
  return {
    service_date: serviceDate,
    preacher_member_id: preacherMemberId,
    preacher_name: String(row.preacher_name ?? '').trim(),
    telegram_chat_id: chatId,
    service_plan_id: row.service_plan_id == null ? null : Number(row.service_plan_id),
    share_token: row.share_token == null ? null : String(row.share_token).trim() || null,
    sermon_topic: String(row.sermon_topic ?? '').trim(),
    sermon_scripture: String(row.sermon_scripture ?? '').trim(),
  };
}

/**
 * Кандидаты на даты в окне [fromYmd, toYmd]:
 * проповедник назначен через программу или слот, есть Telegram chat_id,
 * данные проповеди ещё не заполнены, напоминание ещё не уходило.
 */
export async function listDuePreacherSermonDataReminders(
  fromYmd: string,
  toYmd: string = fromYmd,
): Promise<PreacherSermonDataReminderCandidate[]> {
  await ensurePreacherSermonDataReminderSchema();
  await ensureSundayScheduleSlotsSchema();
  const from = String(fromYmd ?? '').trim().slice(0, 10);
  const to = String(toYmd ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];

  const res = await query(
    `with dates as (
       select generate_series($1::date, $2::date, '1 day'::interval)::date as service_date
     ),
     plan_pick as (
       select distinct on (p.service_date)
         p.id as service_plan_id,
         p.service_date,
         p.preacher_member_id as plan_preacher_member_id,
         p.share_token::text as share_token,
         trim(coalesce(sb.topic, '')) as sermon_topic,
         trim(coalesce(sb.scripture, '')) as sermon_scripture
       from public.service_plans p
       join dates d on d.service_date = p.service_date
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
       where coalesce(p.is_archived, false) = false
       order by
         p.service_date,
         case when p.preacher_member_id is not null then 0 else 1 end,
         case
           when p.status = 'draft' then 0
           when p.status = 'published' then 1
           else 2
         end,
         p.id desc
     ),
     assigned as (
       select
         d.service_date::text as service_date,
         coalesce(p.plan_preacher_member_id, s.preacher_member_id) as preacher_member_id,
         p.service_plan_id,
         p.share_token,
         coalesce(p.sermon_topic, '') as sermon_topic,
         coalesce(p.sermon_scripture, '') as sermon_scripture
       from dates d
       left join plan_pick p on p.service_date = d.service_date
       left join public.sunday_schedule_slots s on s.service_date = d.service_date
     )
     select
       a.service_date,
       a.preacher_member_id,
       a.service_plan_id,
       a.share_token,
       a.sermon_topic,
       a.sermon_scripture,
       coalesce(
         nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''),
         m.name,
         ''
       ) as preacher_name,
       nullif(trim(coalesce(m.telegram_chat_id, '')), '') as telegram_chat_id
     from assigned a
     join public.members m on m.id = a.preacher_member_id
     left join public.preacher_sermon_data_reminders r
       on r.service_date = a.service_date::date
      and r.preacher_member_id = a.preacher_member_id
      and r.channel = 'telegram'
     where a.preacher_member_id is not null
       and nullif(trim(coalesce(m.telegram_chat_id, '')), '') is not null
       and coalesce(m.telegram_delivery_blocked, false) = false
       and r.id is null
     order by a.service_date asc, a.preacher_member_id asc`,
    [from, to],
  );

  const out: PreacherSermonDataReminderCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of res.rows) {
    const candidate = mapCandidate(raw as DbRow);
    if (!candidate) continue;
    if (isSermonDataComplete(candidate.sermon_topic, candidate.sermon_scripture)) continue;
    const key = `${candidate.service_date}:${candidate.preacher_member_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

async function markReminderSent(candidate: PreacherSermonDataReminderCandidate): Promise<void> {
  await query(
    `insert into public.preacher_sermon_data_reminders
       (service_date, preacher_member_id, service_plan_id, channel, notified_at)
     values ($1::date, $2, $3, 'telegram', now())
     on conflict (service_date, preacher_member_id, channel)
     do update set
       service_plan_id = coalesce(excluded.service_plan_id, preacher_sermon_data_reminders.service_plan_id),
       notified_at = excluded.notified_at`,
    [candidate.service_date, candidate.preacher_member_id, candidate.service_plan_id],
  );
}

/**
 * Ежедневная рассылка: Telegram-напоминание проповеднику за ~1.5 недели до служения,
 * чтобы он внёс тему/Писание/презентацию в программу.
 * Если назначили позже — догоняем в окне до целевой даты (включительно).
 */
export async function sendPreacherSermonDataReminders(
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number; target_date: string; from_date: string }> {
  const timeZone = process.env.PREACHER_SERMON_DATA_REMINDER_TZ?.trim() || DEFAULT_TZ;
  const todayYmd = formatYmdInTimeZone(timeZone, now);
  const targetDate = resolvePreacherReminderTargetDateYmd(now, timeZone);
  // Догон: от завтра до даты «через 1.5 недели» — если ещё не напоминали.
  const fromDate = addCalendarDaysYmd(timeZone, todayYmd, 1);
  const candidates = await listDuePreacherSermonDataReminders(fromDate, targetDate);
  const origin = resolvePublicWebOrigin();

  let sent = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    const shareUrl = candidate.share_token
      ? `${origin}/service-plan/share/${candidate.share_token}`
      : `${origin}/service-planner`;
    const text = buildPreacherSermonDataReminderText({
      serviceDateYmd: candidate.service_date,
      preacherName: candidate.preacher_name,
      shareUrl,
    });
    try {
      await sendTelegramToChat({
        chatId: candidate.telegram_chat_id,
        text,
        inlineUrlButton: {
          text: 'Открыть программу',
          url: shareUrl,
        },
      });
      await markReminderSent(candidate);
      sent += 1;
    } catch (e) {
      skipped += 1;
      console.warn('[preacher-sermon-reminder] telegram send failed', {
        preacherMemberId: candidate.preacher_member_id,
        serviceDate: candidate.service_date,
        e,
      });
    }
  }

  return { sent, skipped, target_date: targetDate, from_date: fromDate };
}
