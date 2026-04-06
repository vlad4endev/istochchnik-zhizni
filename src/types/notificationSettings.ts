export type NotificationRepeat = 'day' | 'week' | 'month' | 'year';

export type NotificationImportance = 'low' | 'normal' | 'high';

export type NotificationRuleId =
  | 'prayer_reminder'
  | 'birthday_today'
  | 'birthday_week'
  | 'broadcast_start'
  | 'system_update'
  | 'new_sermon'
  | 'new_event'
  | 'coordinator_week_digest';

export interface NotificationRule {
  id: NotificationRuleId;
  /** Показываемое название (можно править в админке). */
  title: string;
  enabled: boolean;
  /** Локальное время в `timezone` документа, формат HH:mm */
  time: string;
  importance: NotificationImportance;
  repeat: NotificationRepeat;
  /** Для repeat=week: 0=вс … 6=сб (как в JS getDay). */
  weekDay: number;
  /** Для repeat=month: день месяца 1–31 */
  monthDay: number;
  /** Для repeat=year */
  yearMonth: number;
  yearDay: number;
}

export interface NotificationRuntimeState {
  lastSermonEpisodeId?: string | null;
  lastEventCreatedAtIso?: string | null;
  lastBroadcastHash?: string | null;
  /** После первого чтения кода трансляции не шлём ложное «эфир начался». */
  broadcastInitialized?: boolean;
  lastApiBuildStamp?: string | null;
}

export interface NotificationSettingsDocument {
  version: 1;
  timezone: string;
  rules: NotificationRule[];
  runtimeState?: NotificationRuntimeState;
}

export const DEFAULT_NOTIFICATION_TIMEZONE = 'Europe/Moscow';

export const DEFAULT_NOTIFICATION_RULES: readonly NotificationRule[] = [
  {
    id: 'prayer_reminder',
    title: 'Напоминание помолиться',
    enabled: true,
    time: '09:00',
    importance: 'normal',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'birthday_today',
    title: 'Дни рождения сегодня',
    enabled: true,
    time: '10:00',
    importance: 'normal',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'birthday_week',
    title: 'Дни рождения на этой неделе',
    enabled: true,
    time: '09:00',
    importance: 'low',
    repeat: 'week',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'broadcast_start',
    title: 'Трансляция (изменился код плеера)',
    enabled: true,
    time: '09:30',
    importance: 'high',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'system_update',
    title: 'Обновление приложения / API',
    enabled: true,
    time: '12:00',
    importance: 'high',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'new_sermon',
    title: 'Новая проповедь (RSS)',
    enabled: true,
    time: '08:00',
    importance: 'normal',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'new_event',
    title: 'Новое событие в календаре',
    enabled: true,
    time: '08:30',
    importance: 'normal',
    repeat: 'day',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
  {
    id: 'coordinator_week_digest',
    title: 'Координаторам: сбор нужд на неделю',
    enabled: true,
    time: '09:00',
    importance: 'normal',
    repeat: 'week',
    weekDay: 1,
    monthDay: 1,
    yearMonth: 1,
    yearDay: 1,
  },
] as const;

const RULE_IDS = new Set<string>(DEFAULT_NOTIFICATION_RULES.map((r) => r.id));

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function normalizeRule(raw: unknown, fallback: NotificationRule): NotificationRule {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && RULE_IDS.has(o.id) ? (o.id as NotificationRuleId) : fallback.id;
  const base = DEFAULT_NOTIFICATION_RULES.find((r) => r.id === id) ?? fallback;
  return {
    id,
    title: typeof o.title === 'string' && o.title.trim() ? o.title.trim() : base.title,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    time: typeof o.time === 'string' && /^\d{1,2}:\d{2}$/.test(o.time.trim()) ? o.time.trim() : base.time,
    importance:
      o.importance === 'low' || o.importance === 'normal' || o.importance === 'high'
        ? o.importance
        : base.importance,
    repeat:
      o.repeat === 'day' || o.repeat === 'week' || o.repeat === 'month' || o.repeat === 'year'
        ? o.repeat
        : base.repeat,
    weekDay: clampInt(Number(o.weekDay), 0, 6, base.weekDay),
    monthDay: clampInt(Number(o.monthDay), 1, 31, base.monthDay),
    yearMonth: clampInt(Number(o.yearMonth), 1, 12, base.yearMonth),
    yearDay: clampInt(Number(o.yearDay), 1, 31, base.yearDay),
  };
}

export function normalizeNotificationSettingsDocument(raw: unknown): NotificationSettingsDocument {
  const base: NotificationSettingsDocument = {
    version: 1,
    timezone: DEFAULT_NOTIFICATION_TIMEZONE,
    rules: DEFAULT_NOTIFICATION_RULES.map((r) => ({ ...r })),
    runtimeState: {},
  };

  if (!raw || typeof raw !== 'object') return base;

  const o = raw as Record<string, unknown>;
  const tz = typeof o.timezone === 'string' && o.timezone.trim() ? o.timezone.trim() : base.timezone;

  let rules: NotificationRule[] = base.rules;
  if (Array.isArray(o.rules)) {
    const byId = new Map<NotificationRuleId, NotificationRule>();
    for (const d of DEFAULT_NOTIFICATION_RULES) {
      byId.set(d.id, { ...d });
    }
    for (const row of o.rules) {
      const id =
        row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string'
          ? ((row as { id: string }).id as NotificationRuleId)
          : null;
      if (!id || !byId.has(id)) continue;
      byId.set(id, normalizeRule(row, byId.get(id)!));
    }
    rules = DEFAULT_NOTIFICATION_RULES.map((d) => byId.get(d.id)!);
  }

  let runtimeState: NotificationRuntimeState | undefined;
  if (o.runtimeState && typeof o.runtimeState === 'object') {
    const rs = o.runtimeState as Record<string, unknown>;
    runtimeState = {
      lastSermonEpisodeId:
        typeof rs.lastSermonEpisodeId === 'string' || rs.lastSermonEpisodeId === null
          ? (rs.lastSermonEpisodeId as string | null)
          : undefined,
      lastEventCreatedAtIso:
        typeof rs.lastEventCreatedAtIso === 'string' || rs.lastEventCreatedAtIso === null
          ? (rs.lastEventCreatedAtIso as string | null)
          : undefined,
      lastBroadcastHash:
        typeof rs.lastBroadcastHash === 'string' || rs.lastBroadcastHash === null
          ? (rs.lastBroadcastHash as string | null)
          : undefined,
      broadcastInitialized: typeof rs.broadcastInitialized === 'boolean' ? rs.broadcastInitialized : undefined,
      lastApiBuildStamp:
        typeof rs.lastApiBuildStamp === 'string' || rs.lastApiBuildStamp === null
          ? (rs.lastApiBuildStamp as string | null)
          : undefined,
    };
  }

  return { version: 1, timezone: tz, rules, runtimeState };
}

export function publicNotificationPayload(doc: NotificationSettingsDocument): {
  timezone: string;
  rules: NotificationRule[];
} {
  return {
    timezone: doc.timezone,
    rules: doc.rules.map((r) => ({ ...r })),
  };
}
