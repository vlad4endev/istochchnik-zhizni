import { query } from '../config/db';
import { addCalendarDaysYmd, formatYmdInTimeZone, getZonedNow } from '../utils/zonedTime';
import { getPlanDetails } from './servicePlannerService';
import { getTelegramSettings, sendTelegramByPurpose, sendTelegramToChat } from './telegramService';
import {
  ensureServicePlanPlanningMessengerChannel,
  postServicePlanMondayMailingMessengerNotification,
} from './messengerService';

const DEFAULT_TZ = 'Europe/Moscow';
const DEFAULT_PUBLIC_ORIGIN = 'https://app.church-tambov.ru';

/** Шаблон по умолчанию (можно переопределить в админке → Telegram). */
export const DEFAULT_SERVICE_PLAN_MONDAY_MAILING_TEMPLATE = [
  '{{sunday_heading}}',
  '1. Проповедник — {{preacher}}',
  '{{sermon_topic_block}}{{sermon_scripture_block}}2. Группа прославления — {{music}}, в среду или ранее нужно внести в программу гимны и порядок куплетов и припевов для каждой песни.',
  '3. Стих — {{poem}}, в среду или ранее нужно сказать, будет стих или нет, если будет, то нужно прислать:',
  '    1. Чтец',
  '    2. Название',
  '    3. Автор',
  '    4. Текст/тема',
  '4. {{choir_line}}',
  '5. Ведущий — {{leader}}, в четверг нужно будет приступить к формированию программы.',
  '6. Проповедник — {{preacher}}, в четверг нужно предоставить информацию по проповеди для трансляции: название, тезисы, тексты Писания (если будут изменения), если есть презентация, то загрузить в блок проповеди файл презентации к воскресенью 8:00 утра.',
  '7. Медиа-команда, с пятницы по субботу готовит все материалы для трансляции.',
  '8. Ссылка на программу: {{share_url}}',
].join('\n');

export type MondayMailingMemberRef = {
  id: number | null;
  /** `@username` или отображаемое имя */
  mention: string;
  displayName: string;
};

export type MondayMailingBuildInput = {
  serviceDateYmd: string;
  shareToken: string;
  publicOrigin: string;
  preacher: MondayMailingMemberRef;
  music: MondayMailingMemberRef;
  poem: MondayMailingMemberRef;
  leader: MondayMailingMemberRef;
  sermonTopic: string | null;
  sermonScripture: string | null;
  choirLine: string;
  /** Кастомный шаблон из настроек; пустой → DEFAULT */
  template?: string | null;
};

export type ServicePlanMondayMailingResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  service_date?: string;
  plan_id?: number;
  messenger_ok?: boolean;
  telegram_ok?: boolean;
  text?: string;
};

function resolvePublicWebOrigin(): string {
  const fromEnv =
    (typeof process.env.PUBLIC_WEB_ORIGIN === 'string' && process.env.PUBLIC_WEB_ORIGIN.trim()) ||
    (typeof process.env.PUBLIC_APP_URL === 'string' && process.env.PUBLIC_APP_URL.trim()) ||
    '';
  if (!fromEnv) return DEFAULT_PUBLIC_ORIGIN;
  return fromEnv.replace(/\/+$/, '');
}

function resolveMailingTimeZone(): string {
  return process.env.SERVICE_PLAN_MONDAY_MAILING_TZ?.trim() || DEFAULT_TZ;
}

/** Следующее воскресенье в таймзоне церкви (включая «сегодня», если сегодня воскресенье). */
export function resolveUpcomingSundayYmd(now: Date = new Date(), timeZone: string = DEFAULT_TZ): string {
  const z = getZonedNow(timeZone, now);
  const todayYmd = formatYmdInTimeZone(timeZone, now);
  const daysUntilSunday = (7 - z.weekDay) % 7;
  return addCalendarDaysYmd(timeZone, todayYmd, daysUntilSunday);
}

/** Заголовок: «Воскресенье — 26 июля». */
export function formatSundayMailingHeading(serviceDateYmd: string): string {
  const d = new Date(`${serviceDateYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return serviceDateYmd;
  const weekday = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(d);
  const dayMonth = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(d);
  const wd = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${wd} — ${dayMonth}`;
}

function memberMention(ref: MondayMailingMemberRef): string {
  const m = ref.mention.trim();
  if (m) return m;
  const d = ref.displayName.trim();
  return d || 'не назначен';
}

function renderMailingTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => vars[key] ?? '');
}

/**
 * Текст понедельничной рассылки программы служения (мессенджер + Telegram).
 */
export function buildServicePlanMondayMailingText(input: MondayMailingBuildInput): string {
  const heading = formatSundayMailingHeading(input.serviceDateYmd);
  const origin = input.publicOrigin.replace(/\/+$/, '') || DEFAULT_PUBLIC_ORIGIN;
  const shareUrl = `${origin}/service-plan/share/${input.shareToken}`;

  const preacher = memberMention(input.preacher);
  const music = memberMention(input.music);
  const poem = memberMention(input.poem);
  const leader = memberMention(input.leader);

  const topic = (input.sermonTopic ?? '').trim();
  const scripture = (input.sermonScripture ?? '').trim();
  const sermonTopicBlock = topic ? `Тема: «${topic}»\n` : '';
  const sermonScriptureBlock = scripture ? `Текст: ${scripture}\n` : '';

  const templateRaw = (input.template ?? '').trim();
  const template = templateRaw || DEFAULT_SERVICE_PLAN_MONDAY_MAILING_TEMPLATE;

  const rendered = renderMailingTemplate(template, {
    sunday_heading: heading,
    date: heading,
    preacher,
    music,
    poem,
    leader,
    choir_line: input.choirLine,
    sermon_topic: topic,
    sermon_scripture: scripture,
    sermon_topic_block: sermonTopicBlock,
    sermon_scripture_block: sermonScriptureBlock,
    share_url: shareUrl,
  });

  return rendered.replace(/\n{3,}/g, '\n\n').trim();
}

export function resolveChoirLineFromBlocks(
  blocks: Array<{
    title: string;
    assigned_member_id: number | null;
    content_json: Record<string, unknown>;
    block_type_code?: string | null;
  }>,
  mentionByMemberId: Map<number, string>,
): string {
  const choirBlocks = blocks.filter((b) => {
    const title = String(b.title ?? '').toLowerCase();
    const notes = String(b.content_json?.notes ?? b.content_json?.text ?? '').toLowerCase();
    return title.includes('хор') || notes.includes('хор');
  });
  if (choirBlocks.length === 0) {
    return 'Хор петь не будет.';
  }

  for (const block of choirBlocks) {
    const blob = `${block.title} ${String(block.content_json?.notes ?? '')} ${String(block.content_json?.text ?? '')}`.toLowerCase();
    if (/не\s+будет|не\s+по[её]т|петь\s+не\s+будет/.test(blob)) {
      return 'Хор петь не будет.';
    }
  }

  for (const block of choirBlocks) {
    const assigneeId = block.assigned_member_id;
    if (assigneeId != null && mentionByMemberId.has(assigneeId)) {
      return `Хор — ${mentionByMemberId.get(assigneeId)}.`;
    }
  }

  return 'Хор петь не будет.';
}

async function ensureMailingSettingsColumns(): Promise<void> {
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS service_plan_monday_mailing_last_sunday DATE',
  );
}

async function readLastMailedSunday(): Promise<string | null> {
  await ensureMailingSettingsColumns();
  await query(
    `INSERT INTO global_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
  const res = await query(
    `SELECT service_plan_monday_mailing_last_sunday::text AS last_sunday
     FROM global_settings WHERE id = 1 LIMIT 1`,
  );
  const raw = (res.rows[0] as { last_sunday?: string | null } | undefined)?.last_sunday;
  if (!raw) return null;
  const trimmed = String(raw).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

async function markMailedSunday(sundayYmd: string): Promise<void> {
  await ensureMailingSettingsColumns();
  await query(
    `INSERT INTO global_settings (id, start_date, service_plan_monday_mailing_last_sunday)
     VALUES (1, CURRENT_DATE, $1::date)
     ON CONFLICT (id) DO UPDATE
     SET service_plan_monday_mailing_last_sunday = EXCLUDED.service_plan_monday_mailing_last_sunday`,
    [sundayYmd],
  );
}

async function findPlanIdForSunday(sundayYmd: string): Promise<number | null> {
  const res = await query(
    `SELECT id
     FROM public.service_plans
     WHERE service_date = $1::date
       AND COALESCE(is_archived, false) = false
     ORDER BY CASE WHEN status = 'published' THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [sundayYmd],
  );
  const id = (res.rows[0] as { id?: unknown } | undefined)?.id;
  if (id == null) return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadMemberRefs(memberIds: Array<number | null>): Promise<Map<number, MondayMailingMemberRef>> {
  const ids = Array.from(
    new Set(memberIds.filter((id): id is number => id != null && Number.isInteger(id) && id > 0)),
  );
  const map = new Map<number, MondayMailingMemberRef>();
  if (ids.length === 0) return map;

  const res = await query(
    `SELECT
       m.id,
       coalesce(nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''), m.name) AS display_name,
       nullif(trim(m.first_name), '') AS first_name,
       nullif(trim(up.username), '') AS username
     FROM public.members m
     LEFT JOIN public.user_profiles up ON up.member_id = m.id
     WHERE m.id = ANY($1::int[])`,
    [ids],
  );

  for (const row of res.rows as Array<{
    id: number;
    display_name: string | null;
    first_name: string | null;
    username: string | null;
  }>) {
    const id = Number(row.id);
    const displayName = String(row.display_name ?? '').trim() || `участник ${id}`;
    const username = row.username ? String(row.username).trim() : '';
    const firstName = row.first_name ? String(row.first_name).trim() : '';
    const mention = username ? `@${username}` : firstName || displayName;
    map.set(id, { id, mention, displayName });
  }
  return map;
}

function emptyMemberRef(): MondayMailingMemberRef {
  return { id: null, mention: 'не назначен', displayName: 'не назначен' };
}

function pickSermonFields(
  blocks: Array<{ content_json: Record<string, unknown>; block_type_code?: string | null; title: string }>,
  linked: { topic?: string | null; scripture?: string | null } | null,
): { topic: string | null; scripture: string | null } {
  const sermon = blocks.find((b) => String(b.block_type_code ?? '').toLowerCase() === 'sermon');
  const fromBlockTopic =
    sermon && typeof sermon.content_json.sermon_topic === 'string'
      ? sermon.content_json.sermon_topic.trim()
      : '';
  const fromBlockScripture =
    sermon && typeof sermon.content_json.sermon_scripture === 'string'
      ? sermon.content_json.sermon_scripture.trim()
      : '';
  const topic = fromBlockTopic || (linked?.topic ?? '').trim() || null;
  const scripture = fromBlockScripture || (linked?.scripture ?? '').trim() || null;
  return { topic, scripture };
}

/**
 * Собирает и отправляет понедельничную рассылку программы на ближайшее воскресенье.
 * По умолчанию идемпотентна: один раз на каждое воскресенье (ключ в global_settings).
 */
export async function runServicePlanMondayMailing(options?: {
  force?: boolean;
  now?: Date;
  dryRun?: boolean;
}): Promise<ServicePlanMondayMailingResult> {
  const force = options?.force === true;
  const dryRun = options?.dryRun === true;
  const now = options?.now ?? new Date();
  const tz = resolveMailingTimeZone();
  const sundayYmd = resolveUpcomingSundayYmd(now, tz);

  if (!force) {
    const last = await readLastMailedSunday();
    if (last === sundayYmd) {
      return {
        ok: true,
        skipped: true,
        reason: 'already_sent_for_sunday',
        service_date: sundayYmd,
      };
    }
  }

  const planId = await findPlanIdForSunday(sundayYmd);
  if (!planId) {
    return {
      ok: false,
      skipped: true,
      reason: 'no_service_plan',
      service_date: sundayYmd,
    };
  }

  const plan = await getPlanDetails(planId);
  if (!plan) {
    return {
      ok: false,
      skipped: true,
      reason: 'plan_not_found',
      service_date: sundayYmd,
      plan_id: planId,
    };
  }

  const memberMap = await loadMemberRefs([
    plan.preacher_member_id,
    plan.music_ministry_member_id,
    plan.poem_ministry_member_id,
    plan.leader_member_id,
    ...plan.blocks.map((b) => b.assigned_member_id),
  ]);

  const mentionById = new Map<number, string>();
  for (const [id, ref] of memberMap) {
    mentionById.set(id, ref.mention);
  }

  // getPlanDetails не отдаёт block_type_code в mapped blocks — подгружаем коды отдельно
  const codesRes = await query(
    `SELECT b.id, bt.code AS block_type_code
     FROM public.service_blocks b
     LEFT JOIN public.block_types bt ON bt.id = b.block_type_id
     WHERE b.service_plan_id = $1`,
    [planId],
  );
  const codeByBlockId = new Map<number, string>();
  for (const row of codesRes.rows as Array<{ id: number; block_type_code: string | null }>) {
    codeByBlockId.set(Number(row.id), String(row.block_type_code ?? ''));
  }
  const blocksForMailing = plan.blocks.map((b) => ({
    title: b.title,
    assigned_member_id: b.assigned_member_id,
    content_json: b.content_json,
    block_type_code: codeByBlockId.get(b.id) ?? null,
  }));

  const sermon = pickSermonFields(blocksForMailing, plan.linked_sermon_note);
  const choirLine = resolveChoirLineFromBlocks(blocksForMailing, mentionById);

  let tgSettings: Awaited<ReturnType<typeof getTelegramSettings>> | null = null;
  try {
    tgSettings = await getTelegramSettings();
  } catch (e) {
    console.warn('[service-plan-monday-mailing] telegram settings load failed:', e);
  }

  const text = buildServicePlanMondayMailingText({
    serviceDateYmd: plan.service_date,
    shareToken: plan.share_token,
    publicOrigin: resolvePublicWebOrigin(),
    preacher: (plan.preacher_member_id && memberMap.get(plan.preacher_member_id)) || emptyMemberRef(),
    music:
      (plan.music_ministry_member_id && memberMap.get(plan.music_ministry_member_id)) || emptyMemberRef(),
    poem: (plan.poem_ministry_member_id && memberMap.get(plan.poem_ministry_member_id)) || emptyMemberRef(),
    leader: (plan.leader_member_id && memberMap.get(plan.leader_member_id)) || emptyMemberRef(),
    sermonTopic: sermon.topic,
    sermonScripture: sermon.scripture,
    choirLine,
    template: tgSettings?.service_plan_template ?? null,
  });

  if (dryRun) {
    return {
      ok: true,
      skipped: true,
      reason: 'dry_run',
      service_date: plan.service_date,
      plan_id: planId,
      text,
    };
  }

  let messengerOk = false;
  let telegramOk = false;

  try {
    await ensureServicePlanPlanningMessengerChannel();
    await postServicePlanMondayMailingMessengerNotification({
      content: text,
      serviceDateYmd: plan.service_date,
      planId,
      shareToken: plan.share_token,
    });
    messengerOk = true;
  } catch (e) {
    console.error('[service-plan-monday-mailing] messenger send failed:', e);
  }

  try {
    const chatOverride =
      tgSettings?.service_plan_chat_id?.trim() ||
      process.env.TELEGRAM_SERVICE_PLAN_CHAT_ID?.trim() ||
      null;
    await sendTelegramByPurpose({
      purpose: 'default',
      text,
      chatIdOverride: chatOverride,
    });
    telegramOk = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Telegram optional if disabled / missing chat — не валим всю рассылку
    if (
      msg === 'telegram_disabled' ||
      msg === 'telegram_missing_token' ||
      msg === 'telegram_missing_chat'
    ) {
      console.warn(`[service-plan-monday-mailing] telegram skipped: ${msg}`);
    } else {
      console.error('[service-plan-monday-mailing] telegram send failed:', e);
    }
  }

  if (messengerOk || telegramOk) {
    await markMailedSunday(sundayYmd);
  }

  return {
    ok: messengerOk || telegramOk,
    service_date: plan.service_date,
    plan_id: planId,
    messenger_ok: messengerOk,
    telegram_ok: telegramOk,
    text,
    ...(messengerOk || telegramOk ? {} : { reason: 'delivery_failed', skipped: false }),
  };
}

function formatPublishedDateRu(serviceDateYmd: string): string {
  const d = new Date(`${serviceDateYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return serviceDateYmd;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * При публикации программы: сообщение в отдельный Telegram-чат + inline-кнопка со ссылкой.
 */
export async function notifyServicePlanPublishedTelegram(input: {
  serviceDateYmd: string;
  shareToken: string;
}): Promise<{ ok: boolean; skipped?: boolean; reason?: string; chat_id?: string }> {
  const shareToken = String(input.shareToken ?? '').trim();
  const serviceDateYmd = String(input.serviceDateYmd ?? '').trim();
  if (!shareToken || !serviceDateYmd) {
    return { ok: false, skipped: true, reason: 'missing_plan_fields' };
  }

  let settings: Awaited<ReturnType<typeof getTelegramSettings>> | null = null;
  try {
    settings = await getTelegramSettings();
  } catch (e) {
    console.warn('[service-plan-published] telegram settings load failed:', e);
  }

  const chatId =
    settings?.service_plan_published_chat_id?.trim() ||
    process.env.TELEGRAM_SERVICE_PLAN_PUBLISHED_CHAT_ID?.trim() ||
    null;
  if (!chatId) {
    return { ok: false, skipped: true, reason: 'missing_published_chat' };
  }

  const origin = resolvePublicWebOrigin();
  const shareUrl = `${origin}/service-plan/share/${shareToken}`;
  const dateText = formatPublishedDateRu(serviceDateYmd);
  const text = `Финальная программа служения на ${dateText} готова\n\n${shareUrl}`;

  try {
    const sent = await sendTelegramToChat({
      chatId,
      text,
      inlineUrlButton: { text: 'Открыть программу', url: shareUrl },
    });
    return { ok: true, chat_id: sent.chat_id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg === 'telegram_disabled' ||
      msg === 'telegram_missing_token' ||
      msg === 'telegram_missing_chat'
    ) {
      console.warn(`[service-plan-published] telegram skipped: ${msg}`);
      return { ok: false, skipped: true, reason: msg };
    }
    console.error('[service-plan-published] telegram send failed:', e);
    return { ok: false, reason: msg };
  }
}
