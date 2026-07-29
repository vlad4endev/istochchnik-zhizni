import { query } from '../config/db';
import {
  applyCoordinatorBodyTemplate,
  normalizeCoordinatorTelegramScenariosDocument,
  publicCoordinatorTelegramScenariosPayload,
  scenarioWantsChat,
  scenarioWantsDm,
  usesMissingInCycle,
  type CoordinatorTelegramScenario,
  type CoordinatorTelegramScenarioId,
  type CoordinatorTelegramScenariosDocument,
} from '../types/coordinatorTelegramScenarios';
import { getZonedNow, isoWeekKeyFromYmd, parseHm, type ZonedNow } from '../utils/zonedTime';
import { getPrayerDataByDate, type WeekPlanKind } from './calendarService';
import {
  baseWeekVars,
  coordinatorPersonalVars,
  loadCoordinatorWeekTemplateContext,
  missingNeedVars,
  singleAssignmentVars,
} from './coordinatorTelegramTemplateVars';
import {
  sendTelegramByPurpose,
  sendTelegramToChat,
} from './telegramService';

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await query(
    'ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS telegram_coordinator_scenarios_json JSONB',
  );
  schemaReady = true;
}

function ymdFromZoned(z: ZonedNow): string {
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekPeriodKey(z: ZonedNow): string {
  return isoWeekKeyFromYmd(z.year, z.month, z.day);
}

export async function loadCoordinatorTelegramScenarios(): Promise<CoordinatorTelegramScenariosDocument> {
  await ensureSchema();
  const result = await query(
    `SELECT telegram_coordinator_scenarios_json
     FROM global_settings
     WHERE id = 1
     LIMIT 1`,
  );
  const raw = result.rows[0]?.telegram_coordinator_scenarios_json;
  return normalizeCoordinatorTelegramScenariosDocument(raw);
}

export async function saveCoordinatorTelegramScenarios(
  input: unknown,
): Promise<CoordinatorTelegramScenariosDocument> {
  await ensureSchema();
  const current = await loadCoordinatorTelegramScenarios();
  const next = normalizeCoordinatorTelegramScenariosDocument(input);
  // Preserve runtimeState unless explicitly provided in input
  if (
    input &&
    typeof input === 'object' &&
    !('runtimeState' in (input as Record<string, unknown>))
  ) {
    next.runtimeState = current.runtimeState ?? {};
  }
  await query(
    `INSERT INTO global_settings (id, telegram_coordinator_scenarios_json)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       telegram_coordinator_scenarios_json = EXCLUDED.telegram_coordinator_scenarios_json`,
    [JSON.stringify(next)],
  );
  return loadCoordinatorTelegramScenarios();
}

export async function patchCoordinatorTelegramScenarios(patch: {
  timezone?: string;
  scenarios?: CoordinatorTelegramScenario[];
}): Promise<CoordinatorTelegramScenariosDocument> {
  const current = await loadCoordinatorTelegramScenarios();
  const merged = {
    version: 1 as const,
    timezone: typeof patch.timezone === 'string' ? patch.timezone : current.timezone,
    scenarios: Array.isArray(patch.scenarios) ? patch.scenarios : current.scenarios,
    runtimeState: current.runtimeState ?? {},
  };
  return saveCoordinatorTelegramScenarios(merged);
}

export function getCoordinatorTelegramScenariosPublic(
  doc: CoordinatorTelegramScenariosDocument,
): ReturnType<typeof publicCoordinatorTelegramScenariosPayload> {
  return publicCoordinatorTelegramScenariosPayload(doc);
}

async function patchRuntimeState(
  mutator: (doc: CoordinatorTelegramScenariosDocument) => CoordinatorTelegramScenariosDocument,
): Promise<void> {
  const current = await loadCoordinatorTelegramScenarios();
  const next = mutator(current);
  await query(
    `UPDATE global_settings
     SET telegram_coordinator_scenarios_json = $1::jsonb
     WHERE id = 1`,
    [JSON.stringify(next)],
  );
}

async function getMemberTelegramChatId(memberId: number): Promise<string | null> {
  if (!Number.isInteger(memberId) || memberId <= 0) return null;
  const result = await query(
    `SELECT NULLIF(TRIM(COALESCE(telegram_chat_id, '')), '') AS telegram_chat_id
     FROM members
     WHERE id = $1
       AND is_active = TRUE
       AND COALESCE(telegram_delivery_blocked, FALSE) = FALSE
     LIMIT 1`,
    [memberId],
  );
  const raw = result.rows[0]?.telegram_chat_id;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

async function getAdminMemberIdsWithTelegram(): Promise<number[]> {
  const result = await query(
    `SELECT m.id
     FROM members m
     WHERE m.is_active = TRUE
       AND m.app_role = 'admin'
       AND COALESCE(m.telegram_delivery_blocked, FALSE) = FALSE
       AND NULLIF(TRIM(COALESCE(m.telegram_chat_id, '')), '') IS NOT NULL`,
  );
  return result.rows
    .map((r) => Number((r as { id: unknown }).id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

async function getCollectionClaimOwnerForMemberInCycle(
  cycleIndex: number,
  memberId: number,
): Promise<{ id: number; name: string } | null> {
  const result = await query(
    `SELECT
       c.claimed_by_member_id AS id,
       COALESCE(
         NULLIF(TRIM(COALESCE(cm.first_name, '') || ' ' || COALESCE(cm.last_name, '')), ''),
         cm.name,
         'Куратор'
       ) AS display_name
     FROM cycle_collection_claims c
     JOIN members cm ON cm.id = c.claimed_by_member_id
     WHERE c.cycle_index = $1 AND c.member_id = $2
     LIMIT 1`,
    [cycleIndex, memberId],
  );
  const row = result.rows[0] as { id?: unknown; display_name?: unknown } | undefined;
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: typeof row.display_name === 'string' ? row.display_name.trim() : 'Куратор',
  };
}

async function sendDmSafe(memberId: number, text: string): Promise<boolean> {
  const chatId = await getMemberTelegramChatId(memberId);
  if (!chatId) return false;
  try {
    await sendTelegramToChat({ chatId, text });
    return true;
  } catch (err) {
    console.warn(`[coordinator-tg] DM failed for member ${memberId}:`, err);
    return false;
  }
}

async function sendCoordinatorChatSafe(text: string): Promise<boolean> {
  try {
    await sendTelegramByPurpose({ purpose: 'coordinator', text });
    return true;
  } catch (err) {
    console.warn('[coordinator-tg] coordinator chat send failed:', err);
    return false;
  }
}

function findScenario(
  doc: CoordinatorTelegramScenariosDocument,
  id: CoordinatorTelegramScenarioId,
): CoordinatorTelegramScenario | undefined {
  return doc.scenarios.find((s) => s.id === id);
}

function renderScenarioText(
  scenario: CoordinatorTelegramScenario,
  vars: Record<string, string>,
  fallback: string,
): string {
  const custom = (scenario.customBody ?? '').trim();
  if (!custom) return fallback;
  const rendered = applyCoordinatorBodyTemplate(custom, vars).trim();
  return rendered || fallback;
}

/**
 * Event-driven: новое назначение координатору (зеркало push curator_assignment_*).
 */
export async function notifyCoordinatorTelegramAssignment(args: {
  coordinatorId: number;
  title: string;
  body: string;
  weekKind?: WeekPlanKind;
  coordinatorName?: string;
  memberId?: number;
  memberName?: string;
  actorLabel?: string;
}): Promise<{ sent_dm: boolean; sent_chat: boolean }> {
  const doc = await loadCoordinatorTelegramScenarios();
  const scenario = findScenario(doc, 'assignment');
  if (!scenario?.enabled) {
    return { sent_dm: false, sent_chat: false };
  }

  const weekKind: WeekPlanKind = args.weekKind === 'current' ? 'current' : 'next';
  const ctx = await loadCoordinatorWeekTemplateContext(weekKind);
  const row = ctx.assignments.find((a) => a.coordinatorId === args.coordinatorId);
  const coordinatorName =
    args.coordinatorName?.trim() ||
    row?.coordinatorName ||
    'Координатор';

  let vars: Record<string, string>;
  if (args.memberName || args.memberId) {
    vars = singleAssignmentVars({
      title: args.title,
      body: args.body,
      actor: args.actorLabel?.trim() || '',
      coordinatorName,
      memberName: args.memberName?.trim() || `Участник ${args.memberId ?? ''}`.trim(),
      memberId: args.memberId ?? null,
      ctx,
    });
  } else if (row) {
    vars = coordinatorPersonalVars(ctx, row, {
      title: args.title,
      body: args.body,
      actor: args.actorLabel?.trim() || '',
      member_name: '',
    });
  } else {
    vars = {
      ...baseWeekVars(ctx),
      coordinator_name: coordinatorName,
      title: args.title,
      body: args.body,
      actor: args.actorLabel?.trim() || '',
      member_name: '',
      participants: '',
      participants_list: '',
      participants_count: '0',
      participants_with_dates: '',
      cycle_schedule: '',
    };
  }

  const fallback = `${args.title}\n\n${args.body}`;
  const text = renderScenarioText(scenario, vars, fallback);

  let sentDm = false;
  let sentChat = false;
  if (scenarioWantsDm(scenario.target)) {
    sentDm = await sendDmSafe(args.coordinatorId, text);
  }
  if (scenarioWantsChat(scenario.target)) {
    sentChat = await sendCoordinatorChatSafe(text);
  }
  return { sent_dm: sentDm, sent_chat: sentChat };
}

/**
 * Batch helper for distribution / Monday reminder — one message per coordinator.
 */
export async function notifyCoordinatorTelegramAssignmentsBatch(
  rows: Array<{
    coordinatorId: number;
    title: string;
    body: string;
    weekKind?: WeekPlanKind;
    coordinatorName?: string;
  }>,
): Promise<{ sent: number; total: number }> {
  let sent = 0;
  for (const row of rows) {
    const result = await notifyCoordinatorTelegramAssignment(row);
    if (result.sent_dm || result.sent_chat) sent += 1;
  }
  return { sent, total: rows.length };
}

async function notifyMissingNeedTelegram(
  dateYmd: string,
  title: string,
  dayOffset: number,
  scenario: CoordinatorTelegramScenario,
): Promise<{ sent: number }> {
  const dayData = await getPrayerDataByDate(dateYmd);
  const assigned = dayData.members[0];
  const need = (assigned?.prayer_request ?? '').trim();
  if (!assigned || need.length > 0) return { sent: 0 };

  const memberName = assigned.name?.trim() || `Участник ${assigned.id}`;
  const cycleIndex =
    typeof dayData.prayer_cycle?.index === 'number' ? dayData.prayer_cycle.index : null;
  const owner =
    cycleIndex != null
      ? await getCollectionClaimOwnerForMemberInCycle(cycleIndex, assigned.id)
      : null;

  const vars = {
    ...missingNeedVars({
      title,
      memberName,
      dateYmd,
      coordinatorName: owner?.name ?? '',
      cycleIndex,
      weekKind: 'current',
    }),
    day_offset: String(dayOffset),
  };

  const fallbackBody =
    dayOffset <= 0
      ? `${memberName}: поле нужды на сегодня (${dateYmd}) всё ещё пустое.`
      : dayOffset === 1
        ? `${memberName}: поле нужды на завтра (${dateYmd}) не заполнено.`
        : `${memberName}: поле нужды на ${dateYmd} (через ${dayOffset} дн.) не заполнено.`;
  const text = renderScenarioText(scenario, vars, `${title}\n\n${fallbackBody}`);

  const recipients = new Set<number>();
  if (scenarioWantsDm(scenario.target)) {
    const admins = await getAdminMemberIdsWithTelegram();
    for (const id of admins) recipients.add(id);
    if (owner) recipients.add(owner.id);
  }

  let sent = 0;
  for (const id of recipients) {
    if (await sendDmSafe(id, text)) sent += 1;
  }
  if (scenarioWantsChat(scenario.target)) {
    if (await sendCoordinatorChatSafe(text)) sent += 1;
  }
  return { sent };
}

function claimsWeekKind(scenario: CoordinatorTelegramScenario): WeekPlanKind {
  return scenario.claimsWeek === 'current' ? 'current' : 'next';
}

/**
 * Нет актуальной молитвенной нужды в этом цикле:
 * у назначенных участников нет непустой записи в member_prayer_by_cycle для cycle_index недели.
 */
async function notifyMissingCycleNeedTelegram(
  scenario: CoordinatorTelegramScenario,
): Promise<{ sent: number }> {
  const weekKind = claimsWeekKind(scenario);
  const ctx = await loadCoordinatorWeekTemplateContext(weekKind);
  if (ctx.cycleIndex == null || ctx.assignments.length === 0) {
    return { sent: 0 };
  }

  const allMemberIds = [
    ...new Set(ctx.assignments.flatMap((a) => a.members.map((m) => m.memberId))),
  ];
  if (allMemberIds.length === 0) return { sent: 0 };

  const result = await query(
    `SELECT member_id,
            NULLIF(TRIM(COALESCE(prayer_request, '')), '') AS prayer_request
     FROM member_prayer_by_cycle
     WHERE cycle_index = $1
       AND member_id = ANY($2::int[])`,
    [ctx.cycleIndex, allMemberIds],
  );

  const hasNeed = new Set<number>();
  for (const row of result.rows) {
    const id = Number((row as { member_id?: unknown }).member_id);
    const need = (row as { prayer_request?: unknown }).prayer_request;
    if (Number.isFinite(id) && typeof need === 'string' && need.trim()) {
      hasNeed.add(id);
    }
  }

  type MissingGroup = {
    coordinatorId: number;
    coordinatorName: string;
    missing: Array<{ memberId: number; memberName: string }>;
    allMembers: Array<{ memberId: number; memberName: string }>;
  };

  const groups: MissingGroup[] = [];
  for (const row of ctx.assignments) {
    const missing = row.members.filter((m) => !hasNeed.has(m.memberId));
    if (missing.length === 0) continue;
    groups.push({
      coordinatorId: row.coordinatorId,
      coordinatorName: row.coordinatorName,
      missing,
      allMembers: row.members,
    });
  }

  if (groups.length === 0) return { sent: 0 };

  const title = scenario.title || 'Нет актуальной молитвенной нужды в этом цикле';
  let sent = 0;

  if (scenarioWantsDm(scenario.target)) {
    for (const group of groups) {
      const assignment = ctx.assignments.find((a) => a.coordinatorId === group.coordinatorId);
      if (!assignment) continue;
      const missingNames = group.missing.map((m) => m.memberName);
      const vars = {
        ...coordinatorPersonalVars(ctx, assignment, { title }),
        missing_participants: missingNames.join(', '),
        missing_participants_list: missingNames.map((n) => `• ${n}`).join('\n'),
        missing_count: String(group.missing.length),
      };
      const fallback = [
        title,
        '',
        `Неделя: ${ctx.weekRange} (цикл ${ctx.cycleIndex}).`,
        `Без нужды (${group.missing.length}):`,
        ...missingNames.map((n) => `• ${n}`),
      ].join('\n');
      const text = renderScenarioText(scenario, vars, fallback);
      if (await sendDmSafe(group.coordinatorId, text)) sent += 1;
    }

    const admins = await getAdminMemberIdsWithTelegram();
    if (admins.length > 0) {
      const summaryLines = groups.map(
        (g) => `${g.coordinatorName}: ${g.missing.map((m) => m.memberName).join(', ')}`,
      );
      const totalMissing = groups.reduce((n, g) => n + g.missing.length, 0);
      const adminVars = {
        ...baseWeekVars(ctx),
        title,
        coordinator_name: groups.map((g) => g.coordinatorName).join(', '),
        missing_participants: summaryLines.join('\n'),
        missing_participants_list: summaryLines.map((l) => `• ${l}`).join('\n'),
        missing_count: String(totalMissing),
        participants: baseWeekVars(ctx).all_participants,
      };
      const adminFallback = [
        title,
        '',
        `Неделя: ${ctx.weekRange} (цикл ${ctx.cycleIndex}).`,
        `Без нужды: ${totalMissing}`,
        '',
        ...summaryLines,
      ].join('\n');
      const adminText = renderScenarioText(scenario, adminVars, adminFallback);
      for (const adminId of admins) {
        if (await sendDmSafe(adminId, adminText)) sent += 1;
      }
    }
  }

  if (scenarioWantsChat(scenario.target)) {
    const summaryLines = groups.map(
      (g) => `${g.coordinatorName}: ${g.missing.map((m) => m.memberName).join(', ')}`,
    );
    const totalMissing = groups.reduce((n, g) => n + g.missing.length, 0);
    const chatVars = {
      ...baseWeekVars(ctx),
      title,
      coordinator_name: groups.map((g) => g.coordinatorName).join(', '),
      missing_participants: summaryLines.join('\n'),
      missing_participants_list: summaryLines.map((l) => `• ${l}`).join('\n'),
      missing_count: String(totalMissing),
      participants: baseWeekVars(ctx).all_participants,
    };
    const chatFallback = [
      title,
      '',
      `Неделя: ${ctx.weekRange} (цикл ${ctx.cycleIndex}).`,
      `Без нужды: ${totalMissing}`,
      '',
      ...summaryLines,
    ].join('\n');
    const chatText = renderScenarioText(scenario, chatVars, chatFallback);
    if (await sendCoordinatorChatSafe(chatText)) sent += 1;
  }

  return { sent };
}

/** Текст недельного списка: назначения сгруппированы по координаторам. */
export async function buildCoordinatorWeekListTelegramText(
  weekKind: WeekPlanKind = 'next',
): Promise<string> {
  const ctx = await loadCoordinatorWeekTemplateContext(weekKind);
  const header = `Список по координаторам на ${ctx.weekLabel} неделю (${ctx.weekRange})`;
  if (ctx.assignments.length === 0) {
    return [header, '', 'Назначений пока нет.'].join('\n');
  }
  return [header, '', baseWeekVars(ctx).assignments_block].join('\n');
}

async function runWeekListScenario(
  scenario: CoordinatorTelegramScenario,
  weekKind?: WeekPlanKind,
): Promise<{ sent_dm: number; sent_chat: boolean; text: string }> {
  const resolvedWeek = weekKind ?? claimsWeekKind(scenario);
  const ctx = await loadCoordinatorWeekTemplateContext(resolvedWeek);
  const defaultChatText = await buildCoordinatorWeekListTelegramText(resolvedWeek);
  const chatVars = {
    ...baseWeekVars(ctx),
    title: scenario.title,
    participants: baseWeekVars(ctx).all_participants,
    coordinator_name: baseWeekVars(ctx).all_coordinators,
    participants_count: String(ctx.assignments.reduce((n, a) => n + a.members.length, 0)),
  };
  const chatText = renderScenarioText(scenario, chatVars, defaultChatText);

  let sentChat = false;
  let sentDm = 0;

  if (scenarioWantsChat(scenario.target)) {
    sentChat = await sendCoordinatorChatSafe(chatText);
  }

  if (scenarioWantsDm(scenario.target)) {
    for (const row of ctx.assignments) {
      if (row.members.length === 0) continue;
      const personalVars = coordinatorPersonalVars(ctx, row, { title: scenario.title });
      const personalFallback = [
        `Сбор нужд на ${ctx.weekLabel} неделю (${ctx.weekRange})`,
        '',
        `Вам назначено ${row.members.length} участник(ов):`,
        personalVars.participants_with_dates,
      ].join('\n');
      const personal = renderScenarioText(scenario, personalVars, personalFallback);
      if (await sendDmSafe(row.coordinatorId, personal)) sentDm += 1;
    }
  }

  return { sent_dm: sentDm, sent_chat: sentChat, text: chatText };
}

export async function runCoordinatorTelegramScenarioNow(
  scenarioId: CoordinatorTelegramScenarioId,
): Promise<{
  ok: boolean;
  scenario_id: CoordinatorTelegramScenarioId;
  sent?: number;
  sent_dm?: number;
  sent_chat?: boolean;
  text?: string;
  reason?: string;
}> {
  const doc = await loadCoordinatorTelegramScenarios();
  const scenario = findScenario(doc, scenarioId);
  if (!scenario) {
    return { ok: false, scenario_id: scenarioId, reason: 'unknown_scenario' };
  }
  if (!scenario.enabled) {
    return { ok: false, scenario_id: scenarioId, reason: 'scenario_disabled' };
  }

  const z = getZonedNow(doc.timezone || 'Europe/Moscow');

  if (scenarioId === 'week_list') {
    const result = await runWeekListScenario(scenario);
    return {
      ok: result.sent_chat || result.sent_dm > 0,
      scenario_id: scenarioId,
      sent_dm: result.sent_dm,
      sent_chat: result.sent_chat,
      text: result.text,
    };
  }

  if (usesMissingInCycle(scenario) || scenarioId === 'missing_cycle_need') {
    const result = await notifyMissingCycleNeedTelegram(scenario);
    return { ok: true, scenario_id: scenarioId, sent: result.sent };
  }

  if (scenarioId === 'missing_need_tomorrow' || scenarioId === 'missing_need_today') {
    const offset = scenario.dayOffset;
    const targetYmd = addDaysYmd(ymdFromZoned(z), offset);
    const result = await notifyMissingNeedTelegram(
      targetYmd,
      scenario.title ||
        (offset <= 0
          ? 'Эскалация: нет молитвенной нужды на сегодня'
          : 'Нет молитвенной нужды на день цикла'),
      offset,
      scenario,
    );
    return { ok: true, scenario_id: scenarioId, sent: result.sent };
  }

  return {
    ok: false,
    scenario_id: scenarioId,
    reason: 'assignment_is_event_driven',
  };
}

function scenarioPeriodKey(
  scenario: CoordinatorTelegramScenario,
  z: ZonedNow,
): string {
  if (scenario.repeat === 'daily') {
    return `${scenario.id}:${ymdFromZoned(z)}`;
  }
  return `${scenario.id}:${weekPeriodKey(z)}`;
}

function scheduleMatches(scenario: CoordinatorTelegramScenario, z: ZonedNow): boolean {
  if (scenario.repeat === 'event') return false;
  const hm = parseHm(scenario.time);
  if (!hm || z.hour !== hm.hour || z.minute !== hm.minute) return false;
  if (scenario.repeat === 'weekly' && z.weekDay !== scenario.weekDay) return false;
  return true;
}

/**
 * Минутный тик: плановые сценарии (missing need + week list).
 * Напоминания о пустой нужде по умолчанию daily — так покрываются разные дни цикла у разных координаторов.
 */
export async function processCoordinatorTelegramScenariosDue(
  now = new Date(),
): Promise<{ triggered: string[] }> {
  const doc = await loadCoordinatorTelegramScenarios();
  const tz = doc.timezone || 'Europe/Moscow';
  const z = getZonedNow(tz, now);
  const triggered: string[] = [];
  const runtime = { ...(doc.runtimeState ?? {}) };

  for (const scenario of doc.scenarios) {
    if (!scenario.enabled) continue;
    if (!scheduleMatches(scenario, z)) continue;

    const pk = scenarioPeriodKey(scenario, z);
    if (runtime[scenario.id] === pk) continue;

    try {
      if (scenario.id === 'missing_need_tomorrow' || scenario.id === 'missing_need_today') {
        const offset = scenario.dayOffset;
        const targetYmd = addDaysYmd(ymdFromZoned(z), offset);
        await notifyMissingNeedTelegram(
          targetYmd,
          scenario.title ||
            (offset <= 0
              ? 'Эскалация: нет молитвенной нужды на сегодня'
              : 'Нет молитвенной нужды на день цикла'),
          offset,
          scenario,
        );
      } else if (usesMissingInCycle(scenario) || scenario.id === 'missing_cycle_need') {
        await notifyMissingCycleNeedTelegram(scenario);
      } else if (scenario.id === 'week_list') {
        await runWeekListScenario(scenario);
      } else {
        continue;
      }
      runtime[scenario.id] = pk;
      triggered.push(scenario.id);
    } catch (err) {
      console.error(`[coordinator-tg] scenario ${scenario.id} failed:`, err);
    }
  }

  if (triggered.length > 0) {
    await patchRuntimeState((d) => ({
      ...d,
      runtimeState: runtime,
    }));
  }

  return { triggered };
}
