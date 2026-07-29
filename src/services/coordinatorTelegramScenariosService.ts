import { query } from '../config/db';
import {
  applyCoordinatorBodyTemplate,
  normalizeCoordinatorTelegramScenariosDocument,
  publicCoordinatorTelegramScenariosPayload,
  scenarioWantsChat,
  scenarioWantsDm,
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
  bodyType: 'tomorrow' | 'today',
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

  const vars = missingNeedVars({
    title,
    memberName,
    dateYmd,
    coordinatorName: owner?.name ?? '',
    cycleIndex,
    weekKind: 'current',
  });

  const fallbackBody =
    bodyType === 'tomorrow'
      ? `${memberName}: поле нужды на ${dateYmd} не заполнено.`
      : `${memberName}: поле нужды на сегодня (${dateYmd}) всё ещё пустое.`;
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
  weekKind: WeekPlanKind = 'next',
): Promise<{ sent_dm: number; sent_chat: boolean; text: string }> {
  const ctx = await loadCoordinatorWeekTemplateContext(weekKind);
  const defaultChatText = await buildCoordinatorWeekListTelegramText(weekKind);
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
    const result = await runWeekListScenario(scenario, 'next');
    return {
      ok: result.sent_chat || result.sent_dm > 0,
      scenario_id: scenarioId,
      sent_dm: result.sent_dm,
      sent_chat: result.sent_chat,
      text: result.text,
    };
  }

  if (scenarioId === 'missing_need_tomorrow') {
    const tomorrowYmd = addDaysYmd(ymdFromZoned(z), 1);
    const result = await notifyMissingNeedTelegram(
      tomorrowYmd,
      scenario.title || 'Нет молитвенной нужды на завтра',
      'tomorrow',
      scenario,
    );
    return { ok: true, scenario_id: scenarioId, sent: result.sent };
  }

  if (scenarioId === 'missing_need_today') {
    const todayYmd = ymdFromZoned(z);
    const result = await notifyMissingNeedTelegram(
      todayYmd,
      scenario.title || 'Эскалация: нет молитвенной нужды на сегодня',
      'today',
      scenario,
    );
    return { ok: true, scenario_id: scenarioId, sent: result.sent };
  }

  // assignment — event-only; preview sends week list personal digests as smoke test is wrong.
  return {
    ok: false,
    scenario_id: scenarioId,
    reason: 'assignment_is_event_driven',
  };
}

/**
 * Минутный тик: плановые сценарии (missing need + week list).
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
    if (scenario.id === 'assignment') continue; // event-driven only

    const hm = parseHm(scenario.time);
    if (!hm || z.hour !== hm.hour || z.minute !== hm.minute) continue;
    if (z.weekDay !== scenario.weekDay) continue;

    const pk = `${scenario.id}:${weekPeriodKey(z)}`;
    if (runtime[scenario.id] === pk) continue;

    try {
      if (scenario.id === 'missing_need_tomorrow') {
        const tomorrowYmd = addDaysYmd(ymdFromZoned(z), 1);
        await notifyMissingNeedTelegram(
          tomorrowYmd,
          scenario.title || 'Нет молитвенной нужды на завтра',
          'tomorrow',
          scenario,
        );
      } else if (scenario.id === 'missing_need_today') {
        await notifyMissingNeedTelegram(
          ymdFromZoned(z),
          scenario.title || 'Эскалация: нет молитвенной нужды на сегодня',
          'today',
          scenario,
        );
      } else if (scenario.id === 'week_list') {
        await runWeekListScenario(scenario, 'next');
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
