/**
 * Авторассылка назначений музыкального служения в Telegram-чат.
 * По умолчанию: каждый четверг — список «Позиция — Участник» на ближайшее служение.
 */

export type MusicScheduleMailingTarget = 'upcoming' | 'next_sunday';

/** Получатель рассылки: чат и опционально тема форума. */
export type MusicScheduleMailingChatTarget = {
  /** Telegram chat id, напр. -1001234567890 */
  chat_id: string;
  /**
   * ID темы форума (message_thread_id) в супергруппе.
   * null/undefined — обычное сообщение в чат без темы.
   */
  topic_id?: number | null;
};

export interface MusicScheduleMailingSettings {
  version: 1;
  /** Включена ли автоотправка по расписанию */
  enabled: boolean;
  /** 0=вс … 6=сб; по умолчанию 4 = четверг */
  weekday: number;
  /** HH:mm в timezone */
  time_hhmm: string;
  timezone: string;
  /**
   * @deprecated Используйте `targets`. Первый chat_id из targets (для совместимости).
   */
  chat_id: string | null;
  /** Куда слать: один или несколько чатов (и тем форума). */
  targets: MusicScheduleMailingChatTarget[];
  /**
   * Шаблон сообщения.
   * Плейсхолдеры: {{service_date}}, {{service_date_long}}, {{service_title}},
   * {{service_time}}, {{service_time_block}}, {{assignments}}, {{assignment_count}},
   * {{songs_list}}, {{songs_inline}}, {{songs_count}}, {{songs_block}}
   */
  template: string;
  /**
   * Шаблон одной строки назначения.
   * Плейсхолдеры: {{role}}, {{member}}, {{status}}
   */
  line_template: string;
  /** Какое служение брать: ближайшее upcoming или следующее воскресенье */
  target: MusicScheduleMailingTarget;
  /** Показывать незанятые позиции как «(не назначен)» */
  include_vacant: boolean;
  /** Не слать, если нет ни одного назначения */
  skip_if_empty: boolean;
  /** last-fired key для дедупа (обычно service_date) */
  last_mailed_key?: string | null;
}

export const DEFAULT_MUSIC_SCHEDULE_MAILING_TIMEZONE = 'Europe/Moscow';

export const DEFAULT_MUSIC_SCHEDULE_MAILING_LINE_TEMPLATE = '{{role}} — {{member}}';

export const DEFAULT_MUSIC_SCHEDULE_MAILING_TEMPLATE = [
  '🎵 Музыкальная команда на {{service_date_long}}',
  '{{service_title}}{{service_time_block}}',
  '',
  '{{assignments}}',
  '{{songs_block}}',
].join('\n');

export const DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS: MusicScheduleMailingSettings = {
  version: 1,
  enabled: false,
  weekday: 4,
  time_hhmm: '10:00',
  timezone: DEFAULT_MUSIC_SCHEDULE_MAILING_TIMEZONE,
  chat_id: null,
  targets: [],
  template: DEFAULT_MUSIC_SCHEDULE_MAILING_TEMPLATE,
  line_template: DEFAULT_MUSIC_SCHEDULE_MAILING_LINE_TEMPLATE,
  target: 'upcoming',
  include_vacant: false,
  skip_if_empty: true,
  last_mailed_key: null,
};

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.floor(n)));
}

function normalizeTimeHhmm(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return raw;
  return fallback;
}

function normalizeTimezone(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return fallback;
  }
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeTarget(raw: unknown, fallback: MusicScheduleMailingTarget): MusicScheduleMailingTarget {
  if (raw === 'upcoming' || raw === 'next_sunday') return raw;
  return fallback;
}

/** Допускает числовые id (в т.ч. отрицательные для групп) и @username. */
export function normalizeTelegramChatId(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(Math.trunc(raw));
  }
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^-?\d{5,20}$/.test(t)) return t;
  if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(t)) {
    return t.startsWith('@') ? t : `@${t}`;
  }
  return null;
}

export function normalizeTopicId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function normalizeMusicScheduleMailingChatTarget(
  raw: unknown,
): MusicScheduleMailingChatTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const chatId = normalizeTelegramChatId(o.chat_id);
  if (!chatId) return null;
  const topicId = normalizeTopicId(o.topic_id);
  return topicId != null ? { chat_id: chatId, topic_id: topicId } : { chat_id: chatId };
}

export function normalizeMusicScheduleMailingTargets(raw: unknown): MusicScheduleMailingChatTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: MusicScheduleMailingChatTarget[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = normalizeMusicScheduleMailingChatTarget(item);
    if (!t) continue;
    const key = `${t.chat_id}#${t.topic_id ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function resolveTargetsFromLegacy(o: Record<string, unknown>): MusicScheduleMailingChatTarget[] {
  if (Array.isArray(o.targets)) {
    return normalizeMusicScheduleMailingTargets(o.targets);
  }
  if (Array.isArray(o.chat_ids)) {
    return normalizeMusicScheduleMailingTargets(
      o.chat_ids.map((id) => ({ chat_id: id, topic_id: null })),
    );
  }
  const single = normalizeTelegramChatId(o.chat_id);
  if (single) {
    const topic = normalizeTopicId(o.topic_id);
    return topic != null ? [{ chat_id: single, topic_id: topic }] : [{ chat_id: single }];
  }
  return [];
}

/** Публичный вид без runtime-ключа дедупа. */
export function publicMusicScheduleMailingSettings(
  doc: MusicScheduleMailingSettings,
): Omit<MusicScheduleMailingSettings, 'last_mailed_key'> {
  return {
    version: doc.version,
    enabled: doc.enabled,
    weekday: doc.weekday,
    time_hhmm: doc.time_hhmm,
    timezone: doc.timezone,
    chat_id: doc.chat_id,
    targets: doc.targets,
    template: doc.template,
    line_template: doc.line_template,
    target: doc.target,
    include_vacant: doc.include_vacant,
    skip_if_empty: doc.skip_if_empty,
  };
}

export function normalizeMusicScheduleMailingSettings(
  raw: unknown,
): MusicScheduleMailingSettings {
  const base = DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS;
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }
  const o = raw as Record<string, unknown>;
  const targets = resolveTargetsFromLegacy(o);
  return {
    version: 1,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    weekday: clampInt(Number(o.weekday), 0, 6, base.weekday),
    time_hhmm: normalizeTimeHhmm(o.time_hhmm, base.time_hhmm),
    timezone: normalizeTimezone(o.timezone, base.timezone),
    chat_id: targets[0]?.chat_id ?? null,
    targets,
    template:
      typeof o.template === 'string' && o.template.trim()
        ? o.template
        : base.template,
    line_template:
      typeof o.line_template === 'string' && o.line_template.trim()
        ? o.line_template
        : base.line_template,
    target: normalizeTarget(o.target, base.target),
    include_vacant:
      typeof o.include_vacant === 'boolean' ? o.include_vacant : base.include_vacant,
    skip_if_empty:
      typeof o.skip_if_empty === 'boolean' ? o.skip_if_empty : base.skip_if_empty,
    last_mailed_key:
      o.last_mailed_key !== undefined
        ? normalizeOptionalString(o.last_mailed_key)
        : base.last_mailed_key ?? null,
  };
}

export function mergeMusicScheduleMailingPatch(
  current: MusicScheduleMailingSettings,
  patch: Partial<MusicScheduleMailingSettings> & {
    chat_ids?: string[] | null;
    topic_id?: number | null;
  },
): MusicScheduleMailingSettings {
  const merged: Record<string, unknown> = {
    ...current,
    ...patch,
    version: 1,
    last_mailed_key:
      patch.last_mailed_key !== undefined ? patch.last_mailed_key : current.last_mailed_key,
  };

  if (patch.targets !== undefined) {
    merged.targets = patch.targets;
  } else if (patch.chat_ids !== undefined) {
    merged.targets = (patch.chat_ids ?? []).map((id) => ({ chat_id: id }));
  } else if (patch.chat_id !== undefined && patch.topic_id === undefined) {
    const id = normalizeTelegramChatId(patch.chat_id);
    merged.targets = id ? [{ chat_id: id }] : [];
  } else if (patch.chat_id !== undefined || patch.topic_id !== undefined) {
    const id = normalizeTelegramChatId(
      patch.chat_id !== undefined ? patch.chat_id : current.chat_id,
    );
    const topic =
      patch.topic_id !== undefined
        ? normalizeTopicId(patch.topic_id)
        : current.targets[0]?.topic_id ?? null;
    merged.targets = id
      ? topic != null
        ? [{ chat_id: id, topic_id: topic }]
        : [{ chat_id: id }]
      : [];
  }

  return normalizeMusicScheduleMailingSettings(merged);
}
