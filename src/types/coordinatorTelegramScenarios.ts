/**
 * Сценарии Telegram-рассылки для координаторов сбора молитвенных нужд.
 * Дублируют существующие push-уведомления: назначение, напоминания о пустой нужде, недельный список.
 */

export type CoordinatorTelegramScenarioId =
  | 'assignment'
  | 'missing_need_tomorrow'
  | 'missing_need_today'
  | 'missing_cycle_need'
  | 'week_list';

/** Куда слать: личка координатору, чат координаторов, или оба. */
export type CoordinatorTelegramTarget = 'dm' | 'chat' | 'dm_and_chat';

/**
 * Как часто срабатывает плановый сценарий.
 * - event — только по событию (назначение)
 * - daily — каждый день в `time` (нужно для «пустой нужды»: у координаторов разные дни цикла)
 * - weekly — в выбранный `weekDay` + `time`
 */
export type CoordinatorTelegramRepeat = 'event' | 'daily' | 'weekly';

/** Какая неделя назначений координаторов (сбор нужд). */
export type CoordinatorClaimsWeek = 'current' | 'next';

/**
 * Условие срабатывания напоминания.
 * - none — без проверки нужды (назначение / список)
 * - missing_on_cycle_day — нет нужды у участника дня цикла (сегодня/завтра/…)
 * - missing_in_cycle — нет актуальной нужды в текущем цикле у назначенных участников
 */
export type CoordinatorTelegramCondition =
  | 'none'
  | 'missing_on_cycle_day'
  | 'missing_in_cycle';

export interface CoordinatorTelegramScenario {
  id: CoordinatorTelegramScenarioId;
  /** Показываемое название (можно править в админке). */
  title: string;
  enabled: boolean;
  target: CoordinatorTelegramTarget;
  repeat: CoordinatorTelegramRepeat;
  condition: CoordinatorTelegramCondition;
  /**
   * Локальное время в timezone документа, HH:mm.
   * Для event-сценария `assignment` не используется.
   */
  time: string;
  /** Для repeat=weekly: 0=вс … 6=сб. */
  weekDay: number;
  /**
   * Для condition=missing_on_cycle_day: сколько дней вперёд от «сегодня» проверять день цикла.
   * 0 = сегодня, 1 = завтра, 2 = послезавтра…
   */
  dayOffset: number;
  /** Для missing_in_cycle / week_list: текущая или следующая неделя назначений. */
  claimsWeek: CoordinatorClaimsWeek;
  /** Кастомный текст; плейсхолдеры зависят от сценария. */
  customBody?: string;
}

export interface CoordinatorTelegramScenariosDocument {
  version: 1;
  timezone: string;
  scenarios: CoordinatorTelegramScenario[];
  /** last-fired period keys по id сценария (дедуп плановых отправок). */
  runtimeState?: Record<string, string>;
}

export const DEFAULT_COORDINATOR_TG_TIMEZONE = 'Europe/Moscow';

export const DEFAULT_COORDINATOR_TG_SCENARIOS: readonly CoordinatorTelegramScenario[] = [
  {
    id: 'assignment',
    title: 'Назначение координатору',
    enabled: true,
    target: 'dm',
    repeat: 'event',
    condition: 'none',
    time: '08:00',
    weekDay: 1,
    dayOffset: 0,
    claimsWeek: 'next',
  },
  {
    id: 'missing_need_tomorrow',
    title: 'Напоминание: на завтра нет нужды',
    enabled: true,
    target: 'dm',
    repeat: 'daily',
    condition: 'missing_on_cycle_day',
    time: '18:00',
    weekDay: 0,
    dayOffset: 1,
    claimsWeek: 'next',
  },
  {
    id: 'missing_need_today',
    title: 'Эскалация: сегодня всё ещё нет нужды',
    enabled: true,
    target: 'dm',
    repeat: 'daily',
    condition: 'missing_on_cycle_day',
    time: '08:00',
    weekDay: 1,
    dayOffset: 0,
    claimsWeek: 'current',
  },
  {
    id: 'missing_cycle_need',
    title: 'Нет актуальной нужды в этом цикле',
    enabled: true,
    target: 'dm',
    /** Назначенные участники без текста нужды в member_prayer_by_cycle для текущего цикла. */
    repeat: 'daily',
    condition: 'missing_in_cycle',
    time: '10:00',
    weekDay: 1,
    dayOffset: 0,
    claimsWeek: 'next',
  },
  {
    id: 'week_list',
    title: 'Еженедельный список по координаторам',
    enabled: true,
    target: 'chat',
    repeat: 'weekly',
    condition: 'none',
    time: '09:00',
    weekDay: 1,
    dayOffset: 0,
    claimsWeek: 'next',
  },
] as const;

const SCENARIO_IDS = new Set<string>(DEFAULT_COORDINATOR_TG_SCENARIOS.map((s) => s.id));

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function normalizeTarget(raw: unknown, fallback: CoordinatorTelegramTarget): CoordinatorTelegramTarget {
  if (raw === 'dm' || raw === 'chat' || raw === 'dm_and_chat') return raw;
  return fallback;
}

function defaultConditionForId(id: CoordinatorTelegramScenarioId): CoordinatorTelegramCondition {
  return DEFAULT_COORDINATOR_TG_SCENARIOS.find((s) => s.id === id)?.condition ?? 'none';
}

function defaultRepeatForId(id: CoordinatorTelegramScenarioId): CoordinatorTelegramRepeat {
  return DEFAULT_COORDINATOR_TG_SCENARIOS.find((s) => s.id === id)?.repeat ?? 'weekly';
}

function defaultDayOffsetForId(id: CoordinatorTelegramScenarioId): number {
  return DEFAULT_COORDINATOR_TG_SCENARIOS.find((s) => s.id === id)?.dayOffset ?? 0;
}

function defaultClaimsWeekForId(id: CoordinatorTelegramScenarioId): CoordinatorClaimsWeek {
  return DEFAULT_COORDINATOR_TG_SCENARIOS.find((s) => s.id === id)?.claimsWeek ?? 'next';
}

function normalizeRepeat(
  raw: unknown,
  id: CoordinatorTelegramScenarioId,
  fallback: CoordinatorTelegramRepeat,
): CoordinatorTelegramRepeat {
  if (raw === 'event' || raw === 'daily' || raw === 'weekly') return raw;
  if (id === 'assignment') return 'event';
  if (
    id === 'missing_need_tomorrow' ||
    id === 'missing_need_today' ||
    id === 'missing_cycle_need'
  ) {
    return 'daily';
  }
  if (id === 'week_list') return 'weekly';
  return fallback;
}

function normalizeCondition(
  raw: unknown,
  id: CoordinatorTelegramScenarioId,
  fallback: CoordinatorTelegramCondition,
): CoordinatorTelegramCondition {
  if (raw === 'none' || raw === 'missing_on_cycle_day' || raw === 'missing_in_cycle') return raw;
  return defaultConditionForId(id) || fallback;
}

function normalizeClaimsWeek(
  raw: unknown,
  id: CoordinatorTelegramScenarioId,
  fallback: CoordinatorClaimsWeek,
): CoordinatorClaimsWeek {
  if (raw === 'current' || raw === 'next') return raw;
  return defaultClaimsWeekForId(id) || fallback;
}

function normalizeScenario(
  raw: unknown,
  fallback: CoordinatorTelegramScenario,
): CoordinatorTelegramScenario {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const id =
    typeof o.id === 'string' && SCENARIO_IDS.has(o.id)
      ? (o.id as CoordinatorTelegramScenarioId)
      : fallback.id;
  const base = DEFAULT_COORDINATOR_TG_SCENARIOS.find((s) => s.id === id) ?? fallback;
  const repeat = normalizeRepeat(o.repeat, id, base.repeat);
  const condition = normalizeCondition(o.condition, id, base.condition);
  const dayOffsetRaw =
    o.dayOffset !== undefined
      ? Number(o.dayOffset)
      : id === 'missing_need_tomorrow'
        ? 1
        : id === 'missing_need_today'
          ? 0
          : base.dayOffset;
  return {
    id,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 200) : base.title,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    target: normalizeTarget(o.target, base.target),
    repeat,
    condition,
    time: typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time.trim()) ? o.time.trim() : base.time,
    weekDay: clampInt(Number(o.weekDay), 0, 6, base.weekDay),
    dayOffset: clampInt(dayOffsetRaw, 0, 14, defaultDayOffsetForId(id)),
    claimsWeek: normalizeClaimsWeek(o.claimsWeek, id, base.claimsWeek),
    customBody:
      typeof o.customBody === 'string' && o.customBody.trim().length > 0
        ? o.customBody.trim().slice(0, 4000)
        : '',
  };
}

export function normalizeCoordinatorTelegramScenariosDocument(
  raw: unknown,
): CoordinatorTelegramScenariosDocument {
  const base: CoordinatorTelegramScenariosDocument = {
    version: 1,
    timezone: DEFAULT_COORDINATOR_TG_TIMEZONE,
    scenarios: DEFAULT_COORDINATOR_TG_SCENARIOS.map((s) => ({ ...s })),
    runtimeState: {},
  };

  if (!raw || typeof raw !== 'object') return base;

  const o = raw as Record<string, unknown>;
  const tz =
    typeof o.timezone === 'string' && o.timezone.trim() ? o.timezone.trim() : base.timezone;

  let scenarios: CoordinatorTelegramScenario[] = base.scenarios;
  if (Array.isArray(o.scenarios)) {
    const byId = new Map<CoordinatorTelegramScenarioId, CoordinatorTelegramScenario>();
    for (const d of DEFAULT_COORDINATOR_TG_SCENARIOS) {
      byId.set(d.id, { ...d });
    }
    for (const row of o.scenarios) {
      const id =
        row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string'
          ? ((row as { id: string }).id as CoordinatorTelegramScenarioId)
          : null;
      if (!id || !byId.has(id)) continue;
      byId.set(id, normalizeScenario(row, byId.get(id)!));
    }
    scenarios = DEFAULT_COORDINATOR_TG_SCENARIOS.map((d) => byId.get(d.id)!);
  }

  let runtimeState: Record<string, string> | undefined;
  if (o.runtimeState && typeof o.runtimeState === 'object' && !Array.isArray(o.runtimeState)) {
    runtimeState = {};
    for (const [k, v] of Object.entries(o.runtimeState as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) {
        runtimeState[k] = v.trim().slice(0, 64);
      }
    }
  }

  return { version: 1, timezone: tz, scenarios, runtimeState };
}

export function publicCoordinatorTelegramScenariosPayload(
  doc: CoordinatorTelegramScenariosDocument,
): {
  timezone: string;
  scenarios: CoordinatorTelegramScenario[];
} {
  return {
    timezone: doc.timezone,
    scenarios: doc.scenarios.map((s) => ({ ...s })),
  };
}

export function scenarioWantsDm(target: CoordinatorTelegramTarget): boolean {
  return target === 'dm' || target === 'dm_and_chat';
}

export function scenarioWantsChat(target: CoordinatorTelegramTarget): boolean {
  return target === 'chat' || target === 'dm_and_chat';
}

export function isMissingNeedScenarioId(id: CoordinatorTelegramScenarioId): boolean {
  return (
    id === 'missing_need_tomorrow' ||
    id === 'missing_need_today' ||
    id === 'missing_cycle_need'
  );
}

export function usesCycleDayOffset(scenario: CoordinatorTelegramScenario): boolean {
  return scenario.condition === 'missing_on_cycle_day';
}

export function usesMissingInCycle(scenario: CoordinatorTelegramScenario): boolean {
  return scenario.condition === 'missing_in_cycle' || scenario.id === 'missing_cycle_need';
}

/** Подпись условия относительно дня в молитвенном цикле. */
export function describeDayOffset(dayOffset: number): string {
  if (dayOffset <= 0) return 'в день цикла (сегодня)';
  if (dayOffset === 1) return 'за 1 день до дня цикла (завтра)';
  return `за ${dayOffset} дн. до дня цикла`;
}

/**
 * Подстановка полей в шаблон.
 * Основной формат как у программы/молитвы: {{token}}.
 * Старый формат {token} тоже поддерживается.
 */
export function applyCoordinatorBodyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  const withDouble = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_all, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : '';
  });
  return withDouble.replace(/\{([a-zA-Z0-9_]+)\}/g, (all, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) return vars[key]!;
    return all;
  });
}

export { defaultRepeatForId, defaultDayOffsetForId, defaultConditionForId, defaultClaimsWeekForId };
