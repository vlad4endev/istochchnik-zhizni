import { query } from '../config/db';
import {
  DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS,
  mergeMusicScheduleMailingPatch,
  normalizeMusicScheduleMailingSettings,
  publicMusicScheduleMailingSettings,
  type MusicScheduleMailingSettings,
  type MusicScheduleMailingTarget,
} from '../types/musicScheduleMailing';
import {
  addCalendarDaysYmd,
  formatYmdInTimeZone,
  getZonedNow,
  zonedCalendarNoonUtc,
} from '../utils/zonedTime';
import { newTelegramSendBatchId, type TelegramSendTrigger } from './telegramSendLogService';
import { sendTelegramToChat } from './telegramService';

const SETTINGS_COLUMN = 'telegram_music_schedule_mailing_json';

export type MusicScheduleMailingAssignmentLine = {
  role: string;
  member: string;
  status: string;
  vacant: boolean;
};

export type MusicScheduleMailingPreview = {
  ok: boolean;
  reason?: string;
  plan_id: number | null;
  service_date: string | null;
  service_title: string | null;
  service_time: string | null;
  assignment_count: number;
  text: string | null;
  chat_id: string | null;
};

export type MusicScheduleMailingResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  plan_id?: number | null;
  service_date?: string | null;
  telegram_ok?: boolean;
  text?: string | null;
};

async function ensureMusicScheduleMailingColumn(): Promise<void> {
  await query(
    `ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS ${SETTINGS_COLUMN} JSONB`,
  );
}

export async function loadMusicScheduleMailingSettings(): Promise<MusicScheduleMailingSettings> {
  await ensureMusicScheduleMailingColumn();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const res = await query(
    `SELECT ${SETTINGS_COLUMN} AS doc
     FROM global_settings
     WHERE id = 1
     LIMIT 1`,
  );
  const raw = (res.rows[0] as { doc?: unknown } | undefined)?.doc;
  return normalizeMusicScheduleMailingSettings(raw);
}

export function getMusicScheduleMailingSettingsPublic(
  doc: MusicScheduleMailingSettings = DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS,
): ReturnType<typeof publicMusicScheduleMailingSettings> {
  return publicMusicScheduleMailingSettings(doc);
}

async function saveMusicScheduleMailingSettings(
  doc: MusicScheduleMailingSettings,
): Promise<void> {
  await ensureMusicScheduleMailingColumn();
  await query(
    `INSERT INTO global_settings (id, start_date, ${SETTINGS_COLUMN})
     VALUES (1, CURRENT_DATE, $1::jsonb)
     ON CONFLICT (id) DO UPDATE
     SET ${SETTINGS_COLUMN} = EXCLUDED.${SETTINGS_COLUMN}`,
    [JSON.stringify(doc)],
  );
}

export async function patchMusicScheduleMailingSettings(
  patch: Partial<MusicScheduleMailingSettings>,
): Promise<MusicScheduleMailingSettings> {
  const current = await loadMusicScheduleMailingSettings();
  const next = mergeMusicScheduleMailingPatch(current, patch);
  await saveMusicScheduleMailingSettings(next);
  return next;
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => vars[key] ?? '');
}

function formatDateLongRu(ymd: string, timeZone: string): string {
  try {
    const d = zonedCalendarNoonUtc(timeZone, ymd);
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return ymd;
  }
}

function nextSundayYmd(timeZone: string, now: Date): string {
  const today = formatYmdInTimeZone(timeZone, now);
  const z = getZonedNow(timeZone, now);
  // If today is Sunday (0), take today; else days until next Sunday
  const daysUntilSunday = (7 - z.weekDay) % 7;
  return addCalendarDaysYmd(timeZone, today, daysUntilSunday);
}

async function findTargetPlan(opts: {
  target: MusicScheduleMailingTarget;
  timeZone: string;
  now: Date;
}): Promise<{
  id: number;
  service_date: string;
  title: string;
  start_time: string | null;
} | null> {
  const today = formatYmdInTimeZone(opts.timeZone, opts.now);
  const fromYmd =
    opts.target === 'next_sunday' ? nextSundayYmd(opts.timeZone, opts.now) : today;

  const res = await query(
    `SELECT
       p.id,
       p.service_date::text AS service_date,
       COALESCE(NULLIF(TRIM(ce.title), ''), NULLIF(TRIM(t.name), ''), 'Служение') AS title,
       CASE
         WHEN p.start_time IS NULL THEN NULL
         ELSE to_char(p.start_time, 'HH24:MI')
       END AS start_time
     FROM public.service_plans p
     LEFT JOIN public.service_templates t ON t.id = p.template_id
     LEFT JOIN public.church_events ce ON ce.id = p.church_event_id
     WHERE COALESCE(p.is_archived, false) = false
       AND p.service_date >= $1::date
       ${opts.target === 'next_sunday' ? 'AND EXTRACT(DOW FROM p.service_date) = 0' : ''}
     ORDER BY
       p.service_date ASC,
       CASE
         WHEN p.status = 'draft' THEN 0
         WHEN p.status = 'published' THEN 1
         ELSE 2
       END,
       p.id DESC
     LIMIT 1`,
    [fromYmd],
  );

  const row = res.rows[0] as
    | {
        id?: unknown;
        service_date?: unknown;
        title?: unknown;
        start_time?: unknown;
      }
    | undefined;
  if (!row?.id) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const service_date = String(row.service_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(service_date)) return null;
  return {
    id,
    service_date,
    title: String(row.title ?? 'Служение').trim() || 'Служение',
    start_time:
      row.start_time == null || String(row.start_time).trim() === ''
        ? null
        : String(row.start_time).trim().slice(0, 5),
  };
}

async function loadAssignmentLines(
  planId: number,
  includeVacant: boolean,
): Promise<MusicScheduleMailingAssignmentLine[]> {
  const rolesRes = await query(
    `SELECT id, name, sort_order
     FROM music_roles
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );

  const assignRes = await query(
    `SELECT
       a.role_id,
       a.status,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, ''))), ''),
         NULLIF(TRIM(m.name), ''),
         'Участник'
       ) AS member_name
     FROM music_assignments a
     JOIN members m ON m.id = a.member_id
     WHERE a.event_ref_id = $1
       AND a.status <> 'declined'`,
    [planId],
  );

  const byRole = new Map<number, { member: string; status: string }>();
  for (const raw of assignRes.rows as Array<{
    role_id?: unknown;
    status?: unknown;
    member_name?: unknown;
  }>) {
    const roleId = Number(raw.role_id);
    if (!Number.isFinite(roleId)) continue;
    byRole.set(roleId, {
      member: String(raw.member_name ?? 'Участник').trim() || 'Участник',
      status: String(raw.status ?? 'assigned'),
    });
  }

  const lines: MusicScheduleMailingAssignmentLine[] = [];
  for (const raw of rolesRes.rows as Array<{ id?: unknown; name?: unknown }>) {
    const roleId = Number(raw.id);
    const roleName = String(raw.name ?? '').trim() || 'Позиция';
    const hit = byRole.get(roleId);
    if (!hit) {
      if (includeVacant) {
        lines.push({
          role: roleName,
          member: '(не назначен)',
          status: 'vacant',
          vacant: true,
        });
      }
      continue;
    }
    lines.push({
      role: roleName,
      member: hit.member,
      status: hit.status,
      vacant: false,
    });
  }
  return lines;
}

function statusLabelRu(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'подтверждено';
    case 'pending':
      return 'ожидает';
    case 'declined':
      return 'отказ';
    case 'vacant':
      return 'не назначен';
    default:
      return 'назначено';
  }
}

export function buildMusicScheduleMailingText(input: {
  template: string;
  lineTemplate: string;
  serviceDate: string;
  serviceTitle: string;
  serviceTime: string | null;
  timeZone: string;
  lines: MusicScheduleMailingAssignmentLine[];
}): string {
  const assignmentLines = input.lines.map((line) =>
    renderTemplate(input.lineTemplate, {
      role: line.role,
      member: line.member,
      status: statusLabelRu(line.status),
    }),
  );
  const assignments = assignmentLines.join('\n');
  const timeBlock = input.serviceTime ? `\nВремя: ${input.serviceTime}` : '';
  return renderTemplate(input.template, {
    service_date: input.serviceDate,
    service_date_long: formatDateLongRu(input.serviceDate, input.timeZone),
    service_title: input.serviceTitle,
    service_time: input.serviceTime ?? '',
    service_time_block: timeBlock,
    assignments,
    assignment_count: String(input.lines.filter((l) => !l.vacant).length),
  }).trim();
}

export async function previewMusicScheduleMailing(options?: {
  now?: Date;
  templateOverride?: string | null;
  lineTemplateOverride?: string | null;
  settingsOverride?: Partial<MusicScheduleMailingSettings>;
}): Promise<MusicScheduleMailingPreview> {
  const stored = await loadMusicScheduleMailingSettings();
  const settings = mergeMusicScheduleMailingPatch(stored, options?.settingsOverride ?? {});
  const now = options?.now ?? new Date();

  const plan = await findTargetPlan({
    target: settings.target,
    timeZone: settings.timezone,
    now,
  });
  if (!plan) {
    return {
      ok: false,
      reason: 'no_upcoming_service',
      plan_id: null,
      service_date: null,
      service_title: null,
      service_time: null,
      assignment_count: 0,
      text: null,
      chat_id: settings.chat_id,
    };
  }

  const lines = await loadAssignmentLines(plan.id, settings.include_vacant);
  const filled = lines.filter((l) => !l.vacant).length;
  if (settings.skip_if_empty && filled === 0) {
    return {
      ok: false,
      reason: 'no_assignments',
      plan_id: plan.id,
      service_date: plan.service_date,
      service_title: plan.title,
      service_time: plan.start_time,
      assignment_count: 0,
      text: null,
      chat_id: settings.chat_id,
    };
  }

  const template =
    options?.templateOverride !== undefined && options.templateOverride != null
      ? String(options.templateOverride)
      : settings.template;
  const lineTemplate =
    options?.lineTemplateOverride !== undefined && options.lineTemplateOverride != null
      ? String(options.lineTemplateOverride)
      : settings.line_template;

  const text = buildMusicScheduleMailingText({
    template,
    lineTemplate,
    serviceDate: plan.service_date,
    serviceTitle: plan.title,
    serviceTime: plan.start_time,
    timeZone: settings.timezone,
    lines,
  });

  return {
    ok: true,
    plan_id: plan.id,
    service_date: plan.service_date,
    service_title: plan.title,
    service_time: plan.start_time,
    assignment_count: filled,
    text,
    chat_id: settings.chat_id,
  };
}

export async function runMusicScheduleMailing(options?: {
  now?: Date;
  force?: boolean;
  trigger?: TelegramSendTrigger;
  templateOverride?: string | null;
  lineTemplateOverride?: string | null;
}): Promise<MusicScheduleMailingResult> {
  const settings = await loadMusicScheduleMailingSettings();
  const now = options?.now ?? new Date();
  const trigger = options?.trigger ?? 'run_now';

  if (!settings.chat_id) {
    return { ok: false, skipped: true, reason: 'missing_chat_id' };
  }

  const preview = await previewMusicScheduleMailing({
    now,
    templateOverride: options?.templateOverride,
    lineTemplateOverride: options?.lineTemplateOverride,
  });

  if (!preview.ok || !preview.text) {
    return {
      ok: false,
      skipped: true,
      reason: preview.reason ?? 'preview_failed',
      plan_id: preview.plan_id,
      service_date: preview.service_date,
      text: preview.text,
    };
  }

  const dedupeKey = preview.service_date;
  if (!options?.force && dedupeKey && settings.last_mailed_key === dedupeKey) {
    return {
      ok: true,
      skipped: true,
      reason: 'already_mailed',
      plan_id: preview.plan_id,
      service_date: preview.service_date,
      text: preview.text,
    };
  }

  const batchId = newTelegramSendBatchId();
  try {
    await sendTelegramToChat({
      chatId: settings.chat_id,
      text: preview.text,
      log: {
        channel: 'music_schedule_mailing',
        trigger,
        batchId,
        kind: 'music_assignments',
        recipientType: 'telegram_chat',
        meta: {
          plan_id: preview.plan_id,
          service_date: preview.service_date,
        },
      },
    });
  } catch (err) {
    console.error('[music-schedule-mailing] telegram send failed:', err);
    return {
      ok: false,
      reason: 'telegram_send_failed',
      plan_id: preview.plan_id,
      service_date: preview.service_date,
      telegram_ok: false,
      text: preview.text,
    };
  }

  if (dedupeKey) {
    await saveMusicScheduleMailingSettings({
      ...settings,
      last_mailed_key: dedupeKey,
    });
  }

  return {
    ok: true,
    plan_id: preview.plan_id,
    service_date: preview.service_date,
    telegram_ok: true,
    text: preview.text,
  };
}

/**
 * Минутный тик: если совпали день недели и время — отправляем рассылку.
 */
export async function processMusicScheduleMailingDue(
  now: Date = new Date(),
): Promise<{ triggered: boolean; result?: MusicScheduleMailingResult }> {
  if (process.env.DISABLE_MUSIC_SCHEDULE_MAILING_CRON === 'true') {
    return { triggered: false };
  }
  const settings = await loadMusicScheduleMailingSettings();
  if (!settings.enabled) return { triggered: false };

  const z = getZonedNow(settings.timezone, now);
  const curHhmm = `${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}`;
  if (z.weekDay !== settings.weekday || curHhmm !== settings.time_hhmm) {
    return { triggered: false };
  }

  const result = await runMusicScheduleMailing({ now, trigger: 'cron' });
  return { triggered: true, result };
}
