import { query } from '../config/db';
import { notifyRealtime } from '../realtime/notify';
import { addUtcDaysToIsoDate, getPrayerCyclePosition } from '../utils/isoDates';
import { getPrayerCycleTodayYmd } from '../utils/prayerPlanTimeZone';
import {
  getCurrentWeekDates,
  getNextWeekDates,
  type WeekPlanKind,
} from './calendarService';

export interface PrayerWatchTopic {
  id: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface PrayerWatchTopicCyclePublic {
  index: number;
  number: number;
  topic_count: number;
  start_date: string;
  end_date: string;
  day_index: number;
}

export interface PrayerWatchTopicDayAssignment {
  date: string;
  topic: PrayerWatchTopic | null;
  cycle: PrayerWatchTopicCyclePublic | null;
  is_override: boolean;
}

export interface PrayerWatchTopicRosterEntry {
  id: number;
  roster_index: number;
  title: string;
  bible_verse: string | null;
  prayer_points: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface PrayerWatchTopicRosterSnapshot {
  anchor_date: string;
  start_date: string;
  total: number;
  today_index: number;
  today_topic_id: number | null;
  cycle_index: number;
  has_custom_roster_order: boolean;
  roster: PrayerWatchTopicRosterEntry[];
}

const TOPIC_SELECT = `
  id, title, bible_verse, prayer_points, notes, is_active, sort_order,
  created_at::text, updated_at::text
`;

export async function ensureWatchTopicSettingsRow(): Promise<void> {
  await query(
    `INSERT INTO prayer_watch_topic_settings (id, start_date)
     VALUES (1, CURRENT_DATE)
     ON CONFLICT (id) DO NOTHING`,
  );
}

export async function getWatchTopicCycleStartDate(): Promise<string> {
  await ensureWatchTopicSettingsRow();
  const result = await query(
    'SELECT start_date::text AS start_date FROM prayer_watch_topic_settings WHERE id = 1',
  );
  return (
    (result.rows[0] as { start_date?: string } | undefined)?.start_date ??
    new Date().toISOString().slice(0, 10)
  );
}

export async function setWatchTopicCycleStartDate(startDate: string): Promise<string> {
  await ensureWatchTopicSettingsRow();
  const result = await query(
    `UPDATE prayer_watch_topic_settings
     SET start_date = $1::date, updated_at = NOW()
     WHERE id = 1
     RETURNING start_date::text AS start_date`,
    [startDate],
  );
  const saved =
    (result.rows[0] as { start_date?: string } | undefined)?.start_date ?? startDate;
  notifyRealtime(['calendar']);
  return saved;
}

export async function listWatchTopics(includeInactive = true): Promise<PrayerWatchTopic[]> {
  const result = await query(
    includeInactive
      ? `SELECT ${TOPIC_SELECT} FROM prayer_watch_topics
         ORDER BY is_active DESC, sort_order ASC, id ASC`
      : `SELECT ${TOPIC_SELECT} FROM prayer_watch_topics
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
  );
  return result.rows as PrayerWatchTopic[];
}

export async function createWatchTopic(input: {
  title: string;
  bible_verse?: string | null;
  prayer_points?: string | null;
  notes?: string | null;
  is_active?: boolean;
}): Promise<PrayerWatchTopic> {
  const maxOrder = await query(
    `SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM prayer_watch_topics`,
  );
  const nextOrder =
    ((maxOrder.rows[0] as { m?: number } | undefined)?.m ?? -1) + 1;
  const result = await query(
    `INSERT INTO prayer_watch_topics (title, bible_verse, prayer_points, notes, is_active, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${TOPIC_SELECT}`,
    [
      input.title.trim(),
      normalizeOptionalText(input.bible_verse),
      normalizeOptionalText(input.prayer_points),
      normalizeOptionalText(input.notes),
      input.is_active !== false,
      nextOrder,
    ],
  );
  notifyRealtime(['calendar']);
  return result.rows[0] as PrayerWatchTopic;
}

export async function updateWatchTopic(
  id: number,
  input: {
    title?: string;
    bible_verse?: string | null;
    prayer_points?: string | null;
    notes?: string | null;
    is_active?: boolean;
    sort_order?: number;
  },
): Promise<PrayerWatchTopic | null> {
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof input.title === 'string') {
    updates.push(`title = $${values.length + 1}`);
    values.push(input.title.trim());
  }
  if (input.bible_verse !== undefined) {
    updates.push(`bible_verse = $${values.length + 1}`);
    values.push(normalizeOptionalText(input.bible_verse));
  }
  if (input.prayer_points !== undefined) {
    updates.push(`prayer_points = $${values.length + 1}`);
    values.push(normalizeOptionalText(input.prayer_points));
  }
  if (input.notes !== undefined) {
    updates.push(`notes = $${values.length + 1}`);
    values.push(normalizeOptionalText(input.notes));
  }
  if (typeof input.is_active === 'boolean') {
    updates.push(`is_active = $${values.length + 1}`);
    values.push(input.is_active);
  }
  if (typeof input.sort_order === 'number' && Number.isInteger(input.sort_order)) {
    updates.push(`sort_order = $${values.length + 1}`);
    values.push(input.sort_order);
  }

  if (updates.length === 0) {
    const existing = await query(
      `SELECT ${TOPIC_SELECT} FROM prayer_watch_topics WHERE id = $1`,
      [id],
    );
    return (existing.rows[0] as PrayerWatchTopic | undefined) ?? null;
  }

  updates.push('updated_at = NOW()');
  values.push(id);
  const result = await query(
    `UPDATE prayer_watch_topics
     SET ${updates.join(', ')}
     WHERE id = $${values.length}
     RETURNING ${TOPIC_SELECT}`,
    values,
  );
  if (!result.rows[0]) return null;
  notifyRealtime(['calendar']);
  return result.rows[0] as PrayerWatchTopic;
}

export async function deleteWatchTopic(id: number): Promise<boolean> {
  const result = await query(
    `DELETE FROM prayer_watch_topics WHERE id = $1 RETURNING id`,
    [id],
  );
  if (!result.rows[0]) return false;
  notifyRealtime(['calendar']);
  return true;
}

async function listActiveTopicsOrdered(): Promise<PrayerWatchTopic[]> {
  const result = await query(
    `SELECT ${TOPIC_SELECT}
     FROM prayer_watch_topics
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return result.rows as PrayerWatchTopic[];
}

async function getCustomTopicIdsForCycle(cycleIndex: number): Promise<number[] | null> {
  const result = await query(
    `SELECT topic_ids FROM prayer_watch_topic_cycle_order WHERE cycle_index = $1`,
    [cycleIndex],
  );
  const row = result.rows[0] as { topic_ids?: number[] } | undefined;
  if (!row?.topic_ids || row.topic_ids.length === 0) return null;
  return row.topic_ids;
}

/** Активные темы в порядке цикла: кастомный порядок + недостающие в конце по sort_order. */
export async function resolveWatchTopicRosterForCycle(
  cycleIndex: number,
): Promise<PrayerWatchTopic[]> {
  const alpha = await listActiveTopicsOrdered();
  if (alpha.length === 0) return [];

  const custom = await getCustomTopicIdsForCycle(cycleIndex);
  if (!custom) return alpha;

  const byId = new Map(alpha.map((t) => [t.id, t]));
  const out: PrayerWatchTopic[] = [];
  for (const id of custom) {
    const topic = byId.get(id);
    if (topic && !out.some((t) => t.id === topic.id)) {
      out.push(topic);
    }
  }
  for (const topic of alpha) {
    if (!out.some((t) => t.id === topic.id)) {
      out.push(topic);
    }
  }
  return out;
}

function computeCycleIndex(cyclePosition: number, topicCount: number): number {
  if (topicCount <= 0) return 0;
  return Math.floor(cyclePosition / topicCount);
}

function dayIndexInCycle(cyclePosition: number, topicCount: number): number {
  if (topicCount <= 0) return 0;
  return ((cyclePosition % topicCount) + topicCount) % topicCount;
}

export async function getWatchTopicCycleSnapshotForDate(
  targetDateIso: string,
): Promise<(PrayerWatchTopicCyclePublic & { diff_days: number }) | null> {
  const start = await getWatchTopicCycleStartDate();
  const topicCount = (await listActiveTopicsOrdered()).length;
  if (topicCount <= 0) return null;

  const cyclePosition = getPrayerCyclePosition(targetDateIso, start);
  const cycleIndex = computeCycleIndex(cyclePosition, topicCount);
  const dayIndex = dayIndexInCycle(cyclePosition, topicCount);
  const rangeStart = addUtcDaysToIsoDate(start, cycleIndex * topicCount);
  const rangeEnd = addUtcDaysToIsoDate(start, (cycleIndex + 1) * topicCount - 1);

  return {
    index: cycleIndex,
    number: cycleIndex + 1,
    topic_count: topicCount,
    start_date: rangeStart,
    end_date: rangeEnd,
    day_index: dayIndex,
    diff_days: cyclePosition,
  };
}

async function getDayOverrideTopicId(targetDate: string): Promise<number | null> {
  const result = await query(
    `SELECT topic_id FROM prayer_watch_topic_day_overrides WHERE target_date = $1::date`,
    [targetDate],
  );
  const row = result.rows[0] as { topic_id?: number } | undefined;
  return row?.topic_id ?? null;
}

export async function getWatchTopicForDate(
  targetDate: string,
): Promise<PrayerWatchTopicDayAssignment> {
  const start = await getWatchTopicCycleStartDate();
  const topicCount = (await listActiveTopicsOrdered()).length;

  if (topicCount <= 0) {
    return { date: targetDate, topic: null, cycle: null, is_override: false };
  }

  const cyclePosition = getPrayerCyclePosition(targetDate, start);
  const cycleIndex = computeCycleIndex(cyclePosition, topicCount);
  const dayIndex = dayIndexInCycle(cyclePosition, topicCount);
  const cycle: PrayerWatchTopicCyclePublic = {
    index: cycleIndex,
    number: cycleIndex + 1,
    topic_count: topicCount,
    start_date: addUtcDaysToIsoDate(start, cycleIndex * topicCount),
    end_date: addUtcDaysToIsoDate(start, (cycleIndex + 1) * topicCount - 1),
    day_index: dayIndex,
  };

  const overrideId = await getDayOverrideTopicId(targetDate);
  if (overrideId != null) {
    const overrideRes = await query(
      `SELECT ${TOPIC_SELECT} FROM prayer_watch_topics WHERE id = $1 AND is_active = TRUE`,
      [overrideId],
    );
    const overrideTopic = overrideRes.rows[0] as PrayerWatchTopic | undefined;
    if (overrideTopic) {
      return { date: targetDate, topic: overrideTopic, cycle, is_override: true };
    }
  }

  const roster = await resolveWatchTopicRosterForCycle(cycleIndex);
  const topic = roster[dayIndex] ?? null;
  return { date: targetDate, topic, cycle, is_override: false };
}

export async function getWatchTopicWeekAssignments(
  kind: WeekPlanKind = 'current',
): Promise<PrayerWatchTopicDayAssignment[]> {
  const dates = kind === 'next' ? getNextWeekDates() : getCurrentWeekDates();
  return Promise.all(dates.map((date) => getWatchTopicForDate(date)));
}

export async function getWatchTopicRosterSnapshot(
  anchorDate: string,
): Promise<PrayerWatchTopicRosterSnapshot> {
  const start = await getWatchTopicCycleStartDate();
  const topicCount = (await listActiveTopicsOrdered()).length;
  const cyclePosition = getPrayerCyclePosition(anchorDate, start);
  const cycleIndex = topicCount > 0 ? computeCycleIndex(cyclePosition, topicCount) : 0;
  const rosterTopics = await resolveWatchTopicRosterForCycle(cycleIndex);
  const custom = await getCustomTopicIdsForCycle(cycleIndex);
  const todayIndex = topicCount > 0 ? dayIndexInCycle(cyclePosition, topicCount) : 0;
  const todayTopic = rosterTopics[todayIndex] ?? null;

  return {
    anchor_date: anchorDate,
    start_date: start,
    total: rosterTopics.length,
    today_index: todayIndex,
    today_topic_id: todayTopic?.id ?? null,
    cycle_index: cycleIndex,
    has_custom_roster_order: Boolean(custom?.length),
    roster: rosterTopics.map((t, i) => ({
      id: t.id,
      roster_index: i,
      title: t.title,
      bible_verse: t.bible_verse,
      prayer_points: t.prayer_points,
      notes: t.notes,
      is_active: t.is_active,
      sort_order: t.sort_order,
    })),
  };
}

export async function saveWatchTopicRosterOrder(input: {
  anchor_date: string;
  ordered_topic_ids: number[];
}): Promise<{ cycle_index: number }> {
  const start = await getWatchTopicCycleStartDate();
  const topicCount = (await listActiveTopicsOrdered()).length;
  if (topicCount <= 0) {
    throw new Error('empty_roster');
  }
  const cyclePosition = getPrayerCyclePosition(input.anchor_date, start);
  const cycleIndex = computeCycleIndex(cyclePosition, topicCount);
  const activeIds = new Set((await listActiveTopicsOrdered()).map((t) => t.id));
  const ordered = input.ordered_topic_ids.filter(
    (id, idx, arr) => activeIds.has(id) && arr.indexOf(id) === idx,
  );
  for (const id of activeIds) {
    if (!ordered.includes(id)) ordered.push(id);
  }

  await query(
    `INSERT INTO prayer_watch_topic_cycle_order (cycle_index, topic_ids, updated_at)
     VALUES ($1, $2::integer[], NOW())
     ON CONFLICT (cycle_index) DO UPDATE
     SET topic_ids = EXCLUDED.topic_ids, updated_at = NOW()`,
    [cycleIndex, ordered],
  );
  notifyRealtime(['calendar']);
  return { cycle_index: cycleIndex };
}

export async function clearWatchTopicRosterOrder(
  anchorDate?: string,
): Promise<{ deleted: number; cycle_index: number | null }> {
  if (!anchorDate) {
    const result = await query(`DELETE FROM prayer_watch_topic_cycle_order RETURNING cycle_index`);
    notifyRealtime(['calendar']);
    return { deleted: result.rowCount ?? 0, cycle_index: null };
  }
  const start = await getWatchTopicCycleStartDate();
  const topicCount = (await listActiveTopicsOrdered()).length;
  if (topicCount <= 0) {
    return { deleted: 0, cycle_index: null };
  }
  const cycleIndex = computeCycleIndex(getPrayerCyclePosition(anchorDate, start), topicCount);
  const result = await query(
    `DELETE FROM prayer_watch_topic_cycle_order WHERE cycle_index = $1 RETURNING cycle_index`,
    [cycleIndex],
  );
  notifyRealtime(['calendar']);
  return { deleted: result.rowCount ?? 0, cycle_index: cycleIndex };
}

export async function setWatchTopicDayOverride(
  targetDate: string,
  topicId: number | null,
): Promise<PrayerWatchTopicDayAssignment> {
  if (topicId == null) {
    await query(`DELETE FROM prayer_watch_topic_day_overrides WHERE target_date = $1::date`, [
      targetDate,
    ]);
  } else {
    const exists = await query(
      `SELECT id FROM prayer_watch_topics WHERE id = $1 AND is_active = TRUE`,
      [topicId],
    );
    if (!exists.rows[0]) {
      throw new Error('topic_not_found');
    }
    await query(
      `INSERT INTO prayer_watch_topic_day_overrides (target_date, topic_id, updated_at)
       VALUES ($1::date, $2, NOW())
       ON CONFLICT (target_date) DO UPDATE
       SET topic_id = EXCLUDED.topic_id, updated_at = NOW()`,
      [targetDate, topicId],
    );
  }
  notifyRealtime(['calendar']);
  return getWatchTopicForDate(targetDate);
}

/** Якорь: выбранная тема приходится на anchor_date (остальной порядок сохраняется). */
export async function anchorWatchTopicOnDate(input: {
  topic_id: number;
  anchor_date: string;
}): Promise<{ start_date: string; roster_index: number }> {
  const alpha = await listActiveTopicsOrdered();
  const rosterIndex = alpha.findIndex((t) => t.id === input.topic_id);
  if (rosterIndex < 0) {
    throw new Error('topic_not_found');
  }
  const topicCount = alpha.length;
  const targetIndex = dayIndexInCycle(rosterIndex, topicCount);
  const newStart = addUtcDaysToIsoDate(input.anchor_date, -targetIndex);
  await setWatchTopicCycleStartDate(newStart);
  return { start_date: newStart, roster_index: rosterIndex };
}

export function getWatchTopicsTodayYmd(): string {
  return getPrayerCycleTodayYmd();
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
