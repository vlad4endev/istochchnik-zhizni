import Parser from 'rss-parser';
import { pool } from '../config/db';
import type { NotificationRule, NotificationSettingsDocument } from '../types/notificationSettings';
import { getZonedNow, isoWeekKeyFromYmd, parseHm, type ZonedNow } from '../utils/zonedTime';
import { readPodcastSettings } from '../controllers/resourcesController';
import { getPrayerDataByDate } from './calendarService';
import { getNextWeekMemberAssignments } from './calendarService';
import { getBirthdayNamesForCalendarDay, getBirthdayNamesForWeekAroundDate } from './notificationBirthdayQueries';
import { loadNotificationSettings, patchNotificationRuntimeState } from './notificationSettingsService';
import {
  getAdminMemberIdsWithPush,
  getCoordinatorMemberIdsWithPush,
  getMemberIdsWithAnyPushSubscription,
} from './fcmSubscriptionService';
import { sendPush } from './pushService';

const parser = new Parser();

const lastFiredPeriod = new Map<string, string>();

function applyBodyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_all, key: string) => vars[key] ?? '');
}

function resolveBody(rule: NotificationRule, fallback: string, vars?: Record<string, string>): string {
  const raw = (rule.customBody ?? '').trim();
  if (!raw) return fallback;
  const rendered = vars ? applyBodyTemplate(raw, vars).trim() : raw;
  return rendered || fallback;
}

function repeatMatches(rule: NotificationRule, z: ZonedNow): boolean {
  switch (rule.repeat) {
    case 'day':
      return true;
    case 'week':
      return z.weekDay === rule.weekDay;
    case 'month':
      return z.day === rule.monthDay;
    case 'year':
      return z.month === rule.yearMonth && z.day === rule.yearDay;
    default:
      return true;
  }
}

function periodKey(rule: NotificationRule, z: ZonedNow): string {
  switch (rule.repeat) {
    case 'day':
      return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
    case 'week':
      return isoWeekKeyFromYmd(z.year, z.month, z.day);
    case 'month':
      return `${z.year}-${String(z.month).padStart(2, '0')}`;
    case 'year':
      return `${z.year}`;
    default:
      return `${z.year}-${z.month}-${z.day}`;
  }
}

async function pushToAllMembers(title: string, body: string, url: string): Promise<void> {
  const ids = await getMemberIdsWithAnyPushSubscription();
  for (const id of ids) {
    await sendPush(id, title, body, { url });
  }
}

async function pushToCoordinators(title: string, body: string, url: string): Promise<void> {
  const ids = await getCoordinatorMemberIdsWithPush();
  for (const id of ids) {
    await sendPush(id, title, body, { url });
  }
}

function ymdFromZoned(z: ZonedNow): string {
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getCollectionClaimOwnerForMemberInCycle(
  cycleIndex: number,
  memberId: number,
): Promise<number | null> {
  if (!pool) return null;
  const result = await pool.query(
    `SELECT claimed_by_member_id
     FROM cycle_collection_claims
     WHERE cycle_index = $1 AND member_id = $2
     LIMIT 1`,
    [cycleIndex, memberId],
  );
  const raw = result.rows[0]?.claimed_by_member_id;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function notifyMissingPrayerNeedForDate(
  dateYmd: string,
  title: string,
  bodyType: 'tomorrow' | 'today',
  customBody?: string,
): Promise<void> {
  const dayData = await getPrayerDataByDate(dateYmd);
  const assigned = dayData.members[0];
  const need = (assigned?.prayer_request ?? '').trim();
  if (!assigned || need.length > 0) return;

  const memberName = assigned.name?.trim() || `Участник ${assigned.id}`;
  const recipients = new Set<number>();

  const admins = await getAdminMemberIdsWithPush();
  for (const id of admins) recipients.add(id);

  const cycleIndex = dayData.prayer_cycle?.index;
  if (typeof cycleIndex === 'number') {
    const ownerId = await getCollectionClaimOwnerForMemberInCycle(cycleIndex, assigned.id);
    if (ownerId != null) recipients.add(ownerId);
  }

  const fallbackBody =
    bodyType === 'tomorrow'
      ? `${memberName}: поле нужды на ${dateYmd} не заполнено.`
      : `${memberName}: поле нужды на сегодня (${dateYmd}) всё ещё пустое.`;
  const custom = (customBody ?? '').trim();
  const body = custom
    ? applyBodyTemplate(custom, { memberName, date: dateYmd }).trim() || fallbackBody
    : fallbackBody;
  const pushType =
    bodyType === 'tomorrow' ? 'missing_prayer_need_tomorrow' : 'missing_prayer_need_today_escalation';

  for (const id of recipients) {
    await sendPush(id, title, body, { url: '/calendar', type: pushType });
  }
}

type BroadcastStartCandidate = {
  id: number;
  title: string | null;
  stream_url: string | null;
  starts_at: string | null;
};

async function getPendingBroadcastStartCandidate(): Promise<BroadcastStartCandidate | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    `select id, title, stream_url, starts_at::text as starts_at
       from broadcasts
      where coalesce(notify_members, true) = true
        and coalesce(notification_sent, false) = false
        and starts_at is not null
        and starts_at <= now()
      order by starts_at asc, id asc
      limit 1`,
  );
  const row = rows[0] as BroadcastStartCandidate | undefined;
  return row ?? null;
}

async function markBroadcastStartNotificationSent(broadcastId: number): Promise<void> {
  if (!pool) return;
  await pool.query(`update broadcasts set notification_sent = true, updated_at = now() where id = $1`, [
    broadcastId,
  ]);
}

async function readLatestEventCreatedAt(): Promise<string | null> {
  if (!pool) return null;
  const { rows } = await pool.query(
    `SELECT created_at::text AS c FROM church_events WHERE is_active = TRUE ORDER BY created_at DESC NULLS LAST LIMIT 1`,
  );
  const c = rows[0]?.c;
  return typeof c === 'string' ? c : null;
}

async function fetchFirstPodcastEpisodeId(): Promise<string | null> {
  try {
    const settings = await readPodcastSettings().catch(() => ({ rssUrl: null as string | null }));
    const rssUrl =
      settings.rssUrl ||
      process.env.RESOURCES_PODCAST_RSS_URL?.trim() ||
      'https://feeds.simplecast.com/54nAGcIl';
    const feed = await parser.parseURL(rssUrl);
    const items = Array.isArray(feed.items) ? feed.items : [];
    const first = items[0] as { guid?: string; id?: string; link?: string } | undefined;
    if (!first) return null;
    return String(first.guid ?? first.id ?? first.link ?? '').trim() || null;
  } catch (e) {
    console.warn('[notifications] RSS read failed', e);
    return null;
  }
}

async function handleRule(rule: NotificationRule, doc: NotificationSettingsDocument, z: ZonedNow): Promise<void> {
  const rs = doc.runtimeState ?? {};

  switch (rule.id) {
    case 'prayer_reminder': {
      const todayYmd = ymdFromZoned(z);
      await pushToAllMembers(
        'Время молитвы',
        resolveBody(rule, 'Напоминание: уделите время молитве за нужды церкви.', { date: todayYmd }),
        '/prayer',
      );
      return;
    }
    case 'birthday_today': {
      const names = await getBirthdayNamesForCalendarDay(z.month, z.day);
      if (names.length === 0) return;
      const namesJoined = names.join(', ');
      await pushToAllMembers(
        'Дни рождения сегодня',
        resolveBody(rule, namesJoined, {
          names: namesJoined,
          date: ymdFromZoned(z),
        }),
        '/dashboard',
      );
      return;
    }
    case 'birthday_week': {
      const names = await getBirthdayNamesForWeekAroundDate(z.year, z.month, z.day);
      if (names.length === 0) return;
      const namesJoined = names.join(', ');
      await pushToAllMembers(
        'Дни рождения на этой неделе',
        resolveBody(rule, namesJoined, { names: namesJoined }),
        '/dashboard',
      );
      return;
    }
    case 'broadcast_start': {
      const candidate = await getPendingBroadcastStartCandidate();
      if (!candidate) return;
      const streamUrl = String(candidate.stream_url ?? '').trim();
      // Если до старта ссылка не была задана — не объявляем о старте и гасим повторные попытки.
      if (!streamUrl) {
        await markBroadcastStartNotificationSent(candidate.id);
        return;
      }
      const title = String(candidate.title ?? '').trim() || 'Трансляция';
      await pushToAllMembers(
        title,
        resolveBody(rule, 'Трансляция началась — присоединяйтесь к эфиру.'),
        '/dashboard',
      );
      await markBroadcastStartNotificationSent(candidate.id);
      return;
    }
    case 'system_update': {
      const stamp =
        String(process.env.BUILD_STAMP ?? process.env.GIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? '').trim() ||
        null;
      if (!stamp) return;
      if (!rs.lastApiBuildStamp) {
        await patchNotificationRuntimeState((d) => ({
          ...d,
          runtimeState: { ...d.runtimeState, lastApiBuildStamp: stamp },
        }));
        return;
      }
      if (rs.lastApiBuildStamp === stamp) return;
      await pushToAllMembers(
        'Обновление',
        resolveBody(rule, 'Вышла новая версия приложения. Обновите страницу или установите свежую сборку.'),
        '/dashboard',
      );
      await patchNotificationRuntimeState((d) => ({
        ...d,
        runtimeState: { ...d.runtimeState, lastApiBuildStamp: stamp },
      }));
      return;
    }
    case 'new_sermon': {
      const epId = await fetchFirstPodcastEpisodeId();
      if (!epId) return;
      if (!rs.lastSermonEpisodeId) {
        await patchNotificationRuntimeState((d) => ({
          ...d,
          runtimeState: { ...d.runtimeState, lastSermonEpisodeId: epId },
        }));
        return;
      }
      if (rs.lastSermonEpisodeId === epId) return;
      await pushToAllMembers('Новая проповедь', resolveBody(rule, 'В ленте появилась новая запись.'), '/sermons');
      await patchNotificationRuntimeState((d) => ({
        ...d,
        runtimeState: { ...d.runtimeState, lastSermonEpisodeId: epId },
      }));
      return;
    }
    case 'new_event': {
      const created = await readLatestEventCreatedAt();
      if (!created) return;
      if (!rs.lastEventCreatedAtIso) {
        await patchNotificationRuntimeState((d) => ({
          ...d,
          runtimeState: { ...d.runtimeState, lastEventCreatedAtIso: created },
        }));
        return;
      }
      if (rs.lastEventCreatedAtIso === created) return;
      await pushToAllMembers(
        'Новое событие',
        resolveBody(rule, 'В календаре церкви добавлено или обновлено событие.'),
        '/dashboard',
      );
      await patchNotificationRuntimeState((d) => ({
        ...d,
        runtimeState: { ...d.runtimeState, lastEventCreatedAtIso: created },
      }));
      return;
    }
    case 'coordinator_week_digest': {
      const nextWeekPlan = await getNextWeekMemberAssignments();
      const participantsList = nextWeekPlan
        .filter((item) => item.member !== null)
        .map((item) => item.member!.name)
        .join(', ');
      const body = participantsList
        ? `Участники: ${participantsList}`
        : 'На следующую неделю нет распределённых участников.';
      await pushToCoordinators(
        'Сбор нужд на следующую неделю',
        resolveBody(rule, body, { participants: participantsList }),
        '/calendar',
      );
      return;
    }
    case 'coordinator_missing_need_tomorrow': {
      const todayYmd = ymdFromZoned(z);
      const tomorrowYmd = addDaysYmd(todayYmd, 1);
      await notifyMissingPrayerNeedForDate(
        tomorrowYmd,
        'Нет молитвенной нужды на завтра',
        'tomorrow',
        rule.customBody,
      );
      return;
    }
    case 'coordinator_missing_need_today_escalation': {
      const todayYmd = ymdFromZoned(z);
      await notifyMissingPrayerNeedForDate(
        todayYmd,
        'Эскалация: нет молитвенной нужды на сегодня',
        'today',
        rule.customBody,
      );
      return;
    }
    default:
      return;
  }
}

/**
 * Вызывается из минутного крона: при совпадении времени и периода шлёт push по правилам.
 */
export async function runNotificationRulesTick(): Promise<void> {
  const doc = await loadNotificationSettings();
  const tz = doc.timezone || 'Europe/Moscow';
  const z = getZonedNow(tz);

  for (const rule of doc.rules) {
    if (!rule.enabled) continue;
    const hm = parseHm(rule.time);
    if (!hm || z.hour !== hm.hour || z.minute !== hm.minute) continue;
    if (!repeatMatches(rule, z)) continue;

    const pk = `${rule.id}:${periodKey(rule, z)}`;
    if (lastFiredPeriod.get(rule.id) === pk) continue;

    try {
      const fresh = await loadNotificationSettings();
      await handleRule(rule, fresh, z);
      lastFiredPeriod.set(rule.id, pk);
    } catch (e) {
      console.error('[notifications] rule error', rule.id, e);
    }
  }
}
