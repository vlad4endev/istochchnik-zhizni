import { query } from '../config/db';
import { addCalendarDaysYmd, formatYmdInTimeZone, getZonedNow } from '../utils/zonedTime';
import { getAssignmentsForPlan } from './mediaScheduleService';
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
  /** Читаемое имя; для мессенджера может быть `@[id]` */
  mention: string;
  displayName: string;
};

export type MondayMailingPersonStyle = 'name' | 'messenger';

export type MondayMailingSermonAttachment = {
  name: string;
  url: string;
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
  /** Как показывать людей: имя или упоминание мессенджера `@[id]`. */
  personStyle?: MondayMailingPersonStyle;
  /** Доп. поля программы (необязательны — для обратной совместимости тестов). */
  startTime?: string | null;
  status?: 'draft' | 'published' | string | null;
  notes?: string | null;
  templateName?: string | null;
  durationMinutes?: number | null;
  planId?: number | null;
  editToken?: string | null;
  poemReader?: MondayMailingMemberRef | null;
  poemAuthor?: string | null;
  poemTheme?: string | null;
  poemText?: string | null;
  songs?: string[];
  mediaTeamLines?: string[];
  /** Доп. данные проповеди / конспекта. */
  sermonTitle?: string | null;
  sermonBlockNotes?: string | null;
  sermonBody?: string | null;
  sermonNoteAuthor?: string | null;
  sermonNoteShareToken?: string | null;
  sermonHasNote?: boolean;
  sermonAttachments?: MondayMailingSermonAttachment[];
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

/** Служебный слаг профиля `/profile/member-57` — не Telegram и не красивое имя. */
export function isInternalProfileUsername(username: string | null | undefined): boolean {
  return /^member-\d+$/i.test(String(username ?? '').trim());
}

/**
 * Как показывать человека в тексте рассылки.
 * - name: «Иван Иванов»
 * - messenger: `@[57]` (в чате отобразится как @Имя и уйдёт уведомление)
 */
export function formatMailingPerson(
  ref: MondayMailingMemberRef | null | undefined,
  style: MondayMailingPersonStyle = 'name',
): string {
  if (!ref) return 'не назначен';
  if (style === 'messenger' && ref.id != null && Number.isInteger(ref.id) && ref.id > 0) {
    return `@[${ref.id}]`;
  }
  const d = ref.displayName.trim();
  if (d) return d;
  const m = ref.mention.trim();
  if (m && !isInternalProfileUsername(m.replace(/^@/, ''))) return m;
  return 'не назначен';
}

function memberDisplayName(ref: MondayMailingMemberRef | null | undefined): string {
  return formatMailingPerson(ref, 'name');
}

function renderMailingTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_full, key: string) => vars[key] ?? '');
}

function formatDateShortRu(serviceDateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(serviceDateYmd.trim());
  if (!m) return serviceDateYmd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function formatDateLongRu(serviceDateYmd: string): string {
  const d = new Date(`${serviceDateYmd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return serviceDateYmd;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function statusRu(status: string | null | undefined): string {
  const s = String(status ?? '').trim().toLowerCase();
  if (s === 'published') return 'опубликована';
  if (s === 'draft') return 'черновик';
  return s || 'неизвестно';
}

function stripHtmlToPlain(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n')
    .replace(/<\/\s*div\s*>/gi, '\n')
    .replace(/<\/\s*li\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveAttachmentUrl(url: string, origin: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) return `${origin}${u}`;
  return u;
}

function excerptText(text: string, maxLen = 500): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/**
 * Текст понедельничной рассылки программы служения (мессенджер + Telegram).
 */
export function buildServicePlanMondayMailingText(input: MondayMailingBuildInput): string {
  const heading = formatSundayMailingHeading(input.serviceDateYmd);
  const origin = input.publicOrigin.replace(/\/+$/, '') || DEFAULT_PUBLIC_ORIGIN;
  const shareUrl = `${origin}/service-plan/share/${input.shareToken}`;
  const editToken = (input.editToken ?? '').trim();
  const editUrl = editToken ? `${origin}/service-plan/edit/${editToken}` : '';

  const personStyle: MondayMailingPersonStyle = input.personStyle === 'messenger' ? 'messenger' : 'name';
  const preacher = formatMailingPerson(input.preacher, personStyle);
  const music = formatMailingPerson(input.music, personStyle);
  const poem = formatMailingPerson(input.poem, personStyle);
  const leader = formatMailingPerson(input.leader, personStyle);

  const topic = (input.sermonTopic ?? '').trim();
  const scripture = (input.sermonScripture ?? '').trim();
  const sermonTitle = (input.sermonTitle ?? '').trim();
  const sermonBlockNotes = (input.sermonBlockNotes ?? '').trim();
  const sermonBodyRaw = (input.sermonBody ?? '').trim();
  const sermonBody = sermonBodyRaw ? stripHtmlToPlain(sermonBodyRaw) : '';
  const sermonBodyExcerpt = sermonBody ? excerptText(sermonBody, 500) : '';
  const sermonNoteAuthor = (input.sermonNoteAuthor ?? '').trim();
  const sermonNoteShareToken = (input.sermonNoteShareToken ?? '').trim();
  const sermonNoteUrl = sermonNoteShareToken
    ? `${origin}/sermon-notes/share/${sermonNoteShareToken}`
    : '';
  const sermonHasNote = input.sermonHasNote === true || Boolean(sermonTitle || sermonBody || sermonNoteUrl);

  const sermonTopicBlock = topic ? `Тема: «${topic}»\n` : '';
  const sermonScriptureBlock = scripture ? `Текст: ${scripture}\n` : '';
  const sermonTitleBlock = sermonTitle ? `Название: «${sermonTitle}»\n` : '';

  const attachments = (input.sermonAttachments ?? [])
    .map((a) => ({
      name: String(a.name ?? '').trim(),
      url: resolveAttachmentUrl(String(a.url ?? ''), origin),
    }))
    .filter((a) => a.name && a.url);
  const sermonAttachmentsList =
    attachments.length > 0
      ? attachments.map((a, i) => `${i + 1}. ${a.name}\n${a.url}`).join('\n')
      : 'вложения не загружены';
  const sermonAttachmentsInline =
    attachments.length > 0 ? attachments.map((a) => a.name).join(', ') : 'вложения не загружены';
  const firstAttachment = attachments[0] ?? null;

  const sermonSummaryParts: string[] = [];
  if (sermonTitle) sermonSummaryParts.push(`Название: «${sermonTitle}»`);
  if (topic) sermonSummaryParts.push(`Тема: «${topic}»`);
  if (scripture) sermonSummaryParts.push(`Писание: ${scripture}`);
  if (sermonNoteAuthor) sermonSummaryParts.push(`Автор конспекта: ${sermonNoteAuthor}`);
  if (attachments.length > 0) {
    sermonSummaryParts.push(`Файлы: ${attachments.map((a) => a.name).join(', ')}`);
  }
  if (sermonBlockNotes) sermonSummaryParts.push(sermonBlockNotes);
  const sermonBlock = sermonSummaryParts.join('\n') || 'данные проповеди не заполнены';

  const broadcastParts: string[] = [];
  if (topic) broadcastParts.push(`Тема: «${topic}»`);
  if (scripture) broadcastParts.push(`Текст: ${scripture}`);
  if (firstAttachment) broadcastParts.push(`Презентация: ${firstAttachment.name}\n${firstAttachment.url}`);
  else broadcastParts.push('Презентация: не загружена');
  if (sermonNoteUrl) broadcastParts.push(`Конспект: ${sermonNoteUrl}`);
  const sermonForBroadcast = broadcastParts.join('\n');

  const poemAuthor = (input.poemAuthor ?? '').trim();
  const poemTheme = (input.poemTheme ?? '').trim();
  const poemText = (input.poemText ?? '').trim();
  const poemReader = formatMailingPerson(input.poemReader, personStyle);
  const poemReaderName = memberDisplayName(input.poemReader);
  const poemBlockParts: string[] = [];
  if (poemReader && poemReader !== 'не назначен') poemBlockParts.push(`Чтец: ${poemReader}`);
  if (poemTheme) poemBlockParts.push(`Тема: ${poemTheme}`);
  if (poemAuthor) poemBlockParts.push(`Автор: ${poemAuthor}`);
  if (poemText) poemBlockParts.push(poemText);
  const poemBlock = poemBlockParts.join('\n');

  const songs = (input.songs ?? []).map((s) => s.trim()).filter(Boolean);
  const songsList = songs.length > 0 ? songs.map((s, i) => `${i + 1}. ${s}`).join('\n') : 'песни не указаны';
  const songsInline = songs.length > 0 ? songs.join(', ') : 'песни не указаны';

  const mediaLines = (input.mediaTeamLines ?? []).map((s) => s.trim()).filter(Boolean);
  const mediaTeam =
    mediaLines.length > 0 ? mediaLines.map((l) => `• ${l}`).join('\n') : 'медиа-команда не назначена';
  const mediaTeamInline = mediaLines.length > 0 ? mediaLines.join(', ') : 'медиа-команда не назначена';
  const mediaTeamOrDefault =
    mediaLines.length > 0
      ? mediaTeam
      : 'Медиа-команда, с пятницы по субботу готовит все материалы для трансляции.';

  const notes = (input.notes ?? '').trim();
  const startTime = (input.startTime ?? '').trim();
  const templateName = (input.templateName ?? '').trim();
  const duration =
    input.durationMinutes != null && Number.isFinite(input.durationMinutes)
      ? String(Math.max(0, Math.round(Number(input.durationMinutes))))
      : '';
  const planId =
    input.planId != null && Number.isFinite(input.planId) ? String(Math.trunc(Number(input.planId))) : '';
  const status = String(input.status ?? '').trim();

  const templateRaw = (input.template ?? '').trim();
  const template = templateRaw || DEFAULT_SERVICE_PLAN_MONDAY_MAILING_TEMPLATE;

  const rendered = renderMailingTemplate(template, {
    sunday_heading: heading,
    date: heading,
    service_date: input.serviceDateYmd,
    date_short: formatDateShortRu(input.serviceDateYmd),
    date_long: formatDateLongRu(input.serviceDateYmd),
    start_time: startTime || 'не указано',
    status: status || 'неизвестно',
    status_ru: statusRu(status),
    notes: notes || 'нет заметок',
    template_name: templateName || 'без шаблона',
    duration_minutes: duration || '0',
    plan_id: planId,

    preacher,
    preacher_name: memberDisplayName(input.preacher),
    preacher_mention: preacher,
    music,
    music_name: memberDisplayName(input.music),
    music_mention: music,
    poem,
    poem_name: memberDisplayName(input.poem),
    poem_mention: poem,
    leader,
    leader_name: memberDisplayName(input.leader),
    leader_mention: leader,

    choir_line: input.choirLine,
    choir: input.choirLine,

    sermon_topic: topic || 'тема не указана',
    sermon_scripture: scripture || 'текст не указан',
    sermon_topic_block: sermonTopicBlock,
    sermon_scripture_block: sermonScriptureBlock,
    sermon_title: sermonTitle || 'название не указано',
    sermon_title_block: sermonTitleBlock,
    sermon_notes: sermonBlockNotes || 'заметок нет',
    sermon_body: sermonBody || 'конспект не привязан',
    sermon_body_excerpt: sermonBodyExcerpt || 'конспект не привязан',
    sermon_note_author: sermonNoteAuthor || 'автор конспекта не указан',
    sermon_author: sermonNoteAuthor || 'автор конспекта не указан',
    sermon_note_url: sermonNoteUrl || 'конспект не опубликован',
    sermon_has_note: sermonHasNote ? 'да' : 'нет',
    sermon_attachments_list: sermonAttachmentsList,
    sermon_attachments_inline: sermonAttachmentsInline,
    sermon_attachments_count: String(attachments.length),
    sermon_presentation: firstAttachment?.name ?? 'презентация не загружена',
    sermon_presentation_url: firstAttachment?.url ?? '',
    sermon_block: sermonBlock,
    sermon_for_broadcast: sermonForBroadcast,

    poem_reader: poemReader,
    poem_reader_name: poemReaderName,
    poem_author: poemAuthor || 'автор не указан',
    poem_theme: poemTheme || 'тема стиха не указана',
    poem_text: poemText || 'текст стиха не указан',
    poem_block: poemBlock || 'данные стиха не заполнены',

    songs_list: songsList,
    songs_inline: songsInline,
    songs_count: String(songs.length),

    media_team: mediaTeam,
    media_team_inline: mediaTeamInline,
    media_team_or_default: mediaTeamOrDefault,

    share_url: shareUrl,
    edit_url: editUrl || shareUrl,
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

/**
 * Ближайшая активная программа служения (не архив), начиная с `fromYmd`.
 * На одну дату предпочитаем черновик — именно его обычно готовят к ближайшему воскресенью.
 * Все данные рассылки берутся исключительно из этой программы.
 */
async function findNearestUpcomingPlanId(fromYmd: string): Promise<number | null> {
  const res = await query(
    `SELECT id
     FROM public.service_plans
     WHERE COALESCE(is_archived, false) = false
       AND service_date >= $1::date
     ORDER BY
       service_date ASC,
       CASE
         WHEN status = 'draft' THEN 0
         WHEN status = 'published' THEN 1
         ELSE 2
       END,
       id DESC
     LIMIT 1`,
    [fromYmd],
  );
  const id = (res.rows[0] as { id?: unknown } | undefined)?.id;
  if (id == null) return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Продлевает срок действия публичной ссылки перед рассылкой (токен не меняем). */
async function touchPlanShareTokenIssuedAt(planId: number): Promise<void> {
  await query(
    `UPDATE public.service_plans
     SET share_token_issued_at = now()
     WHERE id = $1
       AND COALESCE(is_archived, false) = false`,
    [planId],
  );
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
       coalesce(nullif(trim(concat(coalesce(m.first_name, ''), ' ', coalesce(m.last_name, ''))), ''), m.name) AS display_name
     FROM public.members m
     WHERE m.id = ANY($1::int[])`,
    [ids],
  );

  for (const row of res.rows as Array<{
    id: number;
    display_name: string | null;
  }>) {
    const id = Number(row.id);
    const displayName = String(row.display_name ?? '').trim() || `участник ${id}`;
    // Не используем user_profiles.username как @mention — часто это member-57
    map.set(id, { id, mention: displayName, displayName });
  }
  return map;
}

function emptyMemberRef(): MondayMailingMemberRef {
  return { id: null, mention: 'не назначен', displayName: 'не назначен' };
}

function pickSermonFields(
  blocks: Array<{ content_json: Record<string, unknown>; block_type_code?: string | null; title: string }>,
  linked: {
    title?: string | null;
    topic?: string | null;
    scripture?: string | null;
    author_name?: string | null;
    share_token?: string | null;
    is_public?: boolean;
  } | null,
): {
  topic: string | null;
  scripture: string | null;
  title: string | null;
  blockNotes: string | null;
  noteAuthor: string | null;
  noteShareToken: string | null;
  hasNote: boolean;
  attachments: MondayMailingSermonAttachment[];
} {
  const sermon = blocks.find((b) => {
    const code = String(b.block_type_code ?? '').toLowerCase();
    const title = String(b.title ?? '').toLowerCase();
    return code === 'sermon' || title.includes('проповед');
  });
  const fromBlockTopic =
    sermon && typeof sermon.content_json.sermon_topic === 'string'
      ? sermon.content_json.sermon_topic.trim()
      : '';
  const fromBlockScripture =
    sermon && typeof sermon.content_json.sermon_scripture === 'string'
      ? sermon.content_json.sermon_scripture.trim()
      : '';
  const blockNotes = sermon
    ? contentString(sermon.content_json, 'notes') || contentString(sermon.content_json, 'text') || null
    : null;
  const topic = fromBlockTopic || (linked?.topic ?? '').trim() || null;
  const scripture = fromBlockScripture || (linked?.scripture ?? '').trim() || null;
  const title = (linked?.title ?? '').trim() || null;
  const noteAuthor = (linked?.author_name ?? '').trim() || null;
  const noteShareToken =
    linked?.is_public && linked.share_token ? String(linked.share_token).trim() : null;
  const attachments = sermon ? parseSermonAttachmentsFromContent(sermon.content_json) : [];
  const hasNote = Boolean(linked?.title || linked?.topic || linked?.scripture || linked?.share_token);
  return {
    topic,
    scripture,
    title,
    blockNotes,
    noteAuthor,
    noteShareToken,
    hasNote,
    attachments,
  };
}

export function parseSermonAttachmentsFromContent(
  contentJson: Record<string, unknown>,
): MondayMailingSermonAttachment[] {
  const raw = contentJson.sermon_attachments;
  if (!Array.isArray(raw)) return [];
  const out: MondayMailingSermonAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    if (!name || !url) continue;
    out.push({ name, url });
    if (out.length >= 5) break;
  }
  return out;
}

async function loadLinkedSermonBody(planId: number): Promise<string | null> {
  try {
    const res = await query(
      `SELECT n.body
       FROM public.sermon_notes n
       LEFT JOIN public.service_plans p ON p.id = n.service_plan_id
       WHERE n.service_plan_id = $1
       ORDER BY
         CASE WHEN p.preacher_member_id IS NOT NULL AND n.member_id = p.preacher_member_id THEN 0 ELSE 1 END,
         n.updated_at DESC
       LIMIT 1`,
      [planId],
    );
    const body = (res.rows[0] as { body?: unknown } | undefined)?.body;
    if (body == null) return null;
    const text = String(body).trim();
    return text || null;
  } catch (e) {
    console.warn('[service-plan-monday-mailing] sermon body load failed:', e);
    return null;
  }
}

type MailingBlockMeta = {
  title: string;
  assigned_member_id: number | null;
  content_json: Record<string, unknown>;
  block_type_code?: string | null;
  song_title?: string | null;
};

function isPoemBlockMeta(b: MailingBlockMeta): boolean {
  const code = String(b.block_type_code ?? '').toLowerCase();
  const title = String(b.title ?? '').toLowerCase();
  return code === 'poem' || title.includes('стих');
}

function isSongBlockMeta(b: MailingBlockMeta): boolean {
  const code = String(b.block_type_code ?? '').toLowerCase();
  return code === 'song' || Boolean(b.song_title?.trim());
}

function contentString(cj: Record<string, unknown>, key: string): string {
  const v = cj[key];
  return typeof v === 'string' ? v.trim() : '';
}

export function pickPoemFields(
  blocks: MailingBlockMeta[],
  memberMap: Map<number, MondayMailingMemberRef>,
): {
  reader: MondayMailingMemberRef | null;
  author: string | null;
  theme: string | null;
  text: string | null;
} {
  const poem = blocks.find(isPoemBlockMeta);
  if (!poem) {
    return { reader: null, author: null, theme: null, text: null };
  }
  const readerId = poem.assigned_member_id;
  const reader =
    readerId != null && memberMap.has(readerId) ? (memberMap.get(readerId) ?? null) : null;
  const author = contentString(poem.content_json, 'poem_author') || null;
  const theme = contentString(poem.content_json, 'poem_theme') || null;
  const text =
    contentString(poem.content_json, 'notes') ||
    contentString(poem.content_json, 'text') ||
    contentString(poem.content_json, 'poem_text') ||
    null;
  return { reader, author, theme, text };
}

export function pickSongTitles(blocks: MailingBlockMeta[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (!isSongBlockMeta(b) && String(b.block_type_code ?? '').toLowerCase() !== 'song') continue;
    const songTitle = (b.song_title ?? '').trim();
    const blockTitle = String(b.title ?? '').trim();
    const label = songTitle || blockTitle;
    if (label) out.push(label);
  }
  return out;
}

async function loadMediaTeamLines(planId: number): Promise<string[]> {
  try {
    const assignments = await getAssignmentsForPlan(planId);
    return assignments
      .filter((a) => a.status !== 'declined')
      .map((a) => {
        const role = String(a.role?.name ?? '').trim() || 'роль';
        const name = String(a.member?.name ?? '').trim() || 'не назначен';
        return `${role} — ${name}`;
      });
  } catch (e) {
    console.warn('[service-plan-monday-mailing] media assignments load failed:', e);
    return [];
  }
}

/**
 * Все поля рассылки — только из указанной программы (блоки, назначения, конспект, share_token).
 * Никаких данных из архивных / прошлых / других планов.
 */
async function loadMailingFieldsFromPlan(planId: number): Promise<{
  plan: NonNullable<Awaited<ReturnType<typeof getPlanDetails>>>;
  blocksForMailing: MailingBlockMeta[];
  memberMap: Map<number, MondayMailingMemberRef>;
  sermon: ReturnType<typeof pickSermonFields>;
  sermonBody: string | null;
  poemFields: ReturnType<typeof pickPoemFields>;
  songs: string[];
  mediaTeamLines: string[];
} | null> {
  const plan = await getPlanDetails(planId);
  if (!plan || plan.is_archived) return null;
  if (Number(plan.id) !== planId) return null;

  const memberMap = await loadMemberRefs([
    plan.preacher_member_id,
    plan.music_ministry_member_id,
    plan.poem_ministry_member_id,
    plan.leader_member_id,
    ...plan.blocks.map((b) => b.assigned_member_id),
  ]);

  const codesRes = await query(
    `SELECT
       b.id,
       bt.code AS block_type_code,
       s.title AS song_title
     FROM public.service_blocks b
     LEFT JOIN public.block_types bt ON bt.id = b.block_type_id
     LEFT JOIN public.songs s ON s.id = b.song_id
     WHERE b.service_plan_id = $1`,
    [planId],
  );
  const metaByBlockId = new Map<number, { block_type_code: string; song_title: string | null }>();
  for (const row of codesRes.rows as Array<{
    id: number;
    block_type_code: string | null;
    song_title: string | null;
  }>) {
    metaByBlockId.set(Number(row.id), {
      block_type_code: String(row.block_type_code ?? ''),
      song_title: row.song_title == null ? null : String(row.song_title),
    });
  }
  const blocksForMailing: MailingBlockMeta[] = plan.blocks.map((b) => {
    const meta = metaByBlockId.get(b.id);
    return {
      title: b.title,
      assigned_member_id: b.assigned_member_id,
      content_json: b.content_json,
      block_type_code: meta?.block_type_code ?? null,
      song_title: meta?.song_title ?? null,
    };
  });

  // linked_sermon_note уже отфильтрован по service_plan_id = planId в getPlanDetails
  const sermon = pickSermonFields(blocksForMailing, plan.linked_sermon_note);
  const sermonBody = await loadLinkedSermonBody(planId);
  const poemFields = pickPoemFields(blocksForMailing, memberMap);
  const songs = pickSongTitles(blocksForMailing);
  const mediaTeamLines = await loadMediaTeamLines(planId);

  return {
    plan,
    blocksForMailing,
    memberMap,
    sermon,
    sermonBody,
    poemFields,
    songs,
    mediaTeamLines,
  };
}

/**
 * Собирает и отправляет понедельничную рассылку.
 * Данные (ссылка, проповедь, люди, песни, стих, медиа) — исключительно из ближайшей
 * активной программы служения; шаблон текста — только оформление из настроек Telegram.
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
  const todayYmd = formatYmdInTimeZone(tz, now);

  // Единственный источник данных — ближайшая активная программа (часто черновик).
  const planId = await findNearestUpcomingPlanId(todayYmd);
  if (!planId) {
    return {
      ok: false,
      skipped: true,
      reason: 'no_service_plan',
      service_date: resolveUpcomingSundayYmd(now, tz),
    };
  }

  await touchPlanShareTokenIssuedAt(planId);

  const loaded = await loadMailingFieldsFromPlan(planId);
  if (!loaded) {
    return {
      ok: false,
      skipped: true,
      reason: 'plan_not_found',
      service_date: resolveUpcomingSundayYmd(now, tz),
      plan_id: planId,
    };
  }

  const { plan, blocksForMailing, memberMap, sermon, sermonBody, poemFields, songs, mediaTeamLines } =
    loaded;

  if (!String(plan.share_token ?? '').trim()) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_share_token',
      service_date: plan.service_date,
      plan_id: planId,
    };
  }

  const sundayYmd = String(plan.service_date ?? '').trim().slice(0, 10);
  if (!sundayYmd) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing_service_date',
      plan_id: planId,
    };
  }

  if (!force) {
    const last = await readLastMailedSunday();
    if (last === sundayYmd) {
      return {
        ok: true,
        skipped: true,
        reason: 'already_sent_for_sunday',
        service_date: sundayYmd,
        plan_id: planId,
      };
    }
  }

  // Шаблон — только оформление; плейсхолдеры заполняются полями этой программы.
  let tgSettings: Awaited<ReturnType<typeof getTelegramSettings>> | null = null;
  try {
    tgSettings = await getTelegramSettings();
  } catch (e) {
    console.warn('[service-plan-monday-mailing] telegram settings load failed:', e);
  }

  const preacherRef =
    (plan.preacher_member_id && memberMap.get(plan.preacher_member_id)) || emptyMemberRef();
  const musicRef =
    (plan.music_ministry_member_id && memberMap.get(plan.music_ministry_member_id)) || emptyMemberRef();
  const poemRef =
    (plan.poem_ministry_member_id && memberMap.get(plan.poem_ministry_member_id)) || emptyMemberRef();
  const leaderRef =
    (plan.leader_member_id && memberMap.get(plan.leader_member_id)) || emptyMemberRef();

  const buildInputBase = {
    serviceDateYmd: plan.service_date,
    shareToken: plan.share_token,
    publicOrigin: resolvePublicWebOrigin(),
    preacher: preacherRef,
    music: musicRef,
    poem: poemRef,
    leader: leaderRef,
    sermonTopic: sermon.topic,
    sermonScripture: sermon.scripture,
    template: tgSettings?.service_plan_template ?? null,
    startTime: plan.start_time,
    status: plan.status,
    notes: plan.notes,
    templateName: plan.template_name,
    durationMinutes: plan.total_duration_minutes,
    planId,
    editToken: plan.edit_token,
    poemReader: poemFields.reader,
    poemAuthor: poemFields.author,
    poemTheme: poemFields.theme,
    poemText: poemFields.text,
    songs,
    mediaTeamLines,
    sermonTitle: sermon.title,
    sermonBlockNotes: sermon.blockNotes,
    sermonBody,
    sermonNoteAuthor: sermon.noteAuthor,
    sermonNoteShareToken: sermon.noteShareToken,
    sermonHasNote: sermon.hasNote,
    sermonAttachments: sermon.attachments,
  };

  const choirLabelsFor = (style: MondayMailingPersonStyle): Map<number, string> => {
    const map = new Map<number, string>();
    for (const [id, ref] of memberMap) {
      map.set(id, formatMailingPerson(ref, style));
    }
    return map;
  };

  const text = buildServicePlanMondayMailingText({
    ...buildInputBase,
    choirLine: resolveChoirLineFromBlocks(blocksForMailing, choirLabelsFor('name')),
    personStyle: 'name',
  });
  const textMessenger = buildServicePlanMondayMailingText({
    ...buildInputBase,
    choirLine: resolveChoirLineFromBlocks(blocksForMailing, choirLabelsFor('messenger')),
    personStyle: 'messenger',
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
      content: textMessenger,
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
