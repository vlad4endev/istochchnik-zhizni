/**
 * Авторассылка назначений музыкального служения в Telegram-чат.
 * По умолчанию: каждый четверг — список «Позиция — Участник» на ближайшее служение.
 */

export type MusicScheduleMailingTarget = 'upcoming' | 'next_sunday';

export interface MusicScheduleMailingSettings {
  version: 1;
  /** Включена ли автоотправка по расписанию */
  enabled: boolean;
  /** 0=вс … 6=сб; по умолчанию 4 = четверг */
  weekday: number;
  /** HH:mm в timezone */
  time_hhmm: string;
  timezone: string;
  /** Telegram chat id (группа/канал из реестра) */
  chat_id: string | null;
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
  return {
    version: 1,
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    weekday: clampInt(Number(o.weekday), 0, 6, base.weekday),
    time_hhmm: normalizeTimeHhmm(o.time_hhmm, base.time_hhmm),
    timezone: normalizeTimezone(o.timezone, base.timezone),
    chat_id: o.chat_id !== undefined ? normalizeOptionalString(o.chat_id) : base.chat_id,
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
  patch: Partial<MusicScheduleMailingSettings>,
): MusicScheduleMailingSettings {
  return normalizeMusicScheduleMailingSettings({
    ...current,
    ...patch,
    version: 1,
    // Preserve runtime dedupe key unless explicitly patched
    last_mailed_key:
      patch.last_mailed_key !== undefined ? patch.last_mailed_key : current.last_mailed_key,
  });
}
