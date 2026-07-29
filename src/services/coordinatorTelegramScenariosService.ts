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
import { getPrayerDataByDate } from './calendarService';
import { DistributionService } from './DistributionService';
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
): Promise<number | null> {
  const result = await query(
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

/**
 * Event-driven: новое назначение координатору (зеркало push curator_assignment_*).
 */
export async function notifyCoordinatorTelegramAssignment(args: {
  coordinatorId: number;
  title: string;
  body: string;
}): Promise<{ sent_dm: boolean; sent_chat: boolean }> {
  const doc = await loadCoordinatorTelegramScenarios();
  const scenario = findScenario(doc, 'assignment');
  if (!scenario?.enabled) {
    return { sent_dm: false, sent_chat: false };
  }

  const custom = (scenario.customBody ?? '').trim();
  const text = custom
    ? applyCoordinatorBodyTemplate(custom, {
        title: args.title,
        body: args.body,
      }).trim() || `${args.title}\n\n${args.body}`
    : `${args.title}\n\n${args.body}`;

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
  rows: Array<{ coordinatorId: number; title: string; body: string }>,
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
  const fallbackBody =
    bodyType === 'tomorrow'
      ? `${memberName}: поле нужды на ${dateYmd} не заполнено.`
      : `${memberName}: поле нужды на сегодня (${dateYmd}) всё ещё пустое.`;
  const custom = (scenario.customBody ?? '').trim();
  const body = custom
    ? applyCoordinatorBodyTemplate(custom, { memberName, date: dateYmd, title }).trim() ||
      fallbackBody
    : fallbackBody;
  const text = `${title}\n\n${body}`;

  const recipients = new Set<number>();
  if (scenarioWantsDm(scenario.target)) {
    const admins = await getAdminMemberIdsWithTelegram();
    for (const id of admins) recipients.add(id);
    const cycleIndex = dayData.prayer_cycle?.index;
    if (typeof cycleIndex === 'number') {
      const ownerId = await getCollectionClaimOwnerForMemberInCycle(cycleIndex, assigned.id);
      if (ownerId != null) recipients.add(ownerId);
    }
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
  weekKind: 'current' | 'next' = 'next',
): Promise<string> {
  const service = new DistributionService();
  const assignments = await service.getCoordinatorAssignmentsForQueueWeek(weekKind);
  const weekLabel = weekKind === 'current' ? 'эту' : 'следующую';

  if (assignments.length === 0) {
    return [
      `Список по координаторам на ${weekLabel} неделю`,
      '',
      'Назначений пока нет.',
    ].join('\n');
  }

  const lines = [`Список по координаторам на ${weekLabel} неделю`, ''];
  for (const row of assignments) {
    lines.push(`${row.coordinatorName}:`);
    if (row.members.length === 0) {
      lines.push('  — нет участников');
    } else {
      for (const m of row.members) {
        lines.push(`  • ${m.memberName}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function runWeekListScenario(
  scenario: CoordinatorTelegramScenario,
  weekKind: 'current' | 'next' = 'next',
): Promise<{ sent_dm: number; sent_chat: boolean; text: string }> {
  const service = new DistributionService();
  const assignments = await service.getCoordinatorAssignmentsForQueueWeek(weekKind);
  const custom = (scenario.customBody ?? '').trim();

  let chatText = await buildCoordinatorWeekListTelegramText(weekKind);
  if (custom) {
    const participants = assignments
      .flatMap((a) => a.members.map((m) => m.memberName))
      .join(', ');
    const rendered = applyCoordinatorBodyTemplate(custom, {
      participants,
      week_kind: weekKind,
    }).trim();
    if (rendered) chatText = rendered;
  }

  let sentChat = false;
  let sentDm = 0;

  if (scenarioWantsChat(scenario.target)) {
    sentChat = await sendCoordinatorChatSafe(chatText);
  }

  if (scenarioWantsDm(scenario.target)) {
    const weekLabel = weekKind === 'current' ? 'эту' : 'следующую';
    for (const row of assignments) {
      if (row.members.length === 0) continue;
      const names = row.members.map((m) => m.memberName).join(', ');
      const personalFallback = [
        `Сбор нужд на ${weekLabel} неделю`,
        '',
        `Вам назначено ${row.members.length} участник(ов): ${names}.`,
      ].join('\n');
      const personal = custom
        ? applyCoordinatorBodyTemplate(custom, {
            participants: names,
            coordinatorName: row.coordinatorName,
            week_kind: weekKind,
            count: String(row.members.length),
          }).trim() || personalFallback
        : personalFallback;
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
