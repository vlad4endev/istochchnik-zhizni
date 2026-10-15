import { APP_ROLE_IDS, type AppRole } from './sectionVisibilitySettings';

export const CALL_STATUS_IDS = [
  'ringing',
  'waiting',
  'active',
  'ended',
  'declined',
  'missed',
  'cancelled',
  'failed',
] as const;

export type CallStatusId = (typeof CALL_STATUS_IDS)[number];

export const CALL_PARTICIPANT_STATUS_IDS = [
  'invited',
  'ringing',
  'joined',
  'left',
  'declined',
  'missed',
  'busy',
] as const;

export type CallParticipantStatusId = (typeof CALL_PARTICIPANT_STATUS_IDS)[number];

export const CALL_END_REASON_IDS = [
  'ended',
  'ended_by_moderator',
  'declined',
  'cancelled',
  'no_answer',
  'all_left',
  'ghost_cleanup',
  'expired_empty',
  'stale_direct',
  'livekit_unavailable',
  'failed',
] as const;

export type CallEndReasonId = (typeof CALL_END_REASON_IDS)[number];

export const DEFAULT_CALL_STATUS_LABELS: Record<CallStatusId, string> = {
  ringing: 'Гудки',
  waiting: 'Ожидание участников',
  active: 'Идёт звонок',
  ended: 'Завершён',
  declined: 'Отклонён',
  missed: 'Пропущен',
  cancelled: 'Отменён',
  failed: 'Ошибка',
};

export const DEFAULT_PARTICIPANT_STATUS_LABELS: Record<CallParticipantStatusId, string> = {
  invited: 'Приглашён',
  ringing: 'Входящий',
  joined: 'В звонке',
  left: 'Вышел',
  declined: 'Отклонил',
  missed: 'Не ответил',
  busy: 'Занят',
};

export const DEFAULT_END_REASON_LABELS: Record<CallEndReasonId, string> = {
  ended: 'Нормальное завершение',
  ended_by_moderator: 'Завершил модератор',
  declined: 'Отклонён адресатом',
  cancelled: 'Отменён инициатором',
  no_answer: 'Нет ответа (таймаут)',
  all_left: 'Все вышли',
  ghost_cleanup: 'Очистка «призраков»',
  expired_empty: 'Истекло без участников',
  stale_direct: 'Устаревший прямой звонок',
  livekit_unavailable: 'Сервис медиа недоступен',
  failed: 'Сбой',
};

export interface CallFeatureFlags {
  direct_calls: boolean;
  group_calls: boolean;
  link_meetings: boolean;
  audio: boolean;
  video: boolean;
}

export interface CallLiveKitSettings {
  /** null — брать из env */
  api_key: string | null;
  api_secret: string | null;
  internal_url: string | null;
  public_url: string | null;
}

export interface CallSettingsDocument {
  /**
   * null — наследовать CALLS_ENABLED из env;
   * true/false — явное включение/выключение из админки.
   */
  enabled: boolean | null;
  livekit: CallLiveKitSettings;
  ring_timeout_sec: number | null;
  token_ttl_sec: number | null;
  invite_ttl_hours: number | null;
  max_group_participants: number | null;
  ghost_grace_sec: number | null;
  ghost_miss_ticks: number | null;
  features: CallFeatureFlags;
  /** Роли, которым разрешено начинать звонки / встречи */
  allowed_roles: AppRole[];
  status_labels: {
    call: Partial<Record<CallStatusId, string>>;
    participant: Partial<Record<CallParticipantStatusId, string>>;
    end_reason: Partial<Record<CallEndReasonId, string>>;
  };
}

export interface CallRuntimeConfig {
  enabled: boolean;
  enabled_source: 'db' | 'env';
  livekit: {
    api_key: string;
    api_secret: string;
    internal_url: string;
    public_url: string;
    configured: boolean;
    api_key_source: 'db' | 'env' | 'none';
    api_secret_source: 'db' | 'env' | 'none';
    internal_url_source: 'db' | 'env' | 'none';
    public_url_source: 'db' | 'env' | 'none';
  };
  ring_timeout_sec: number;
  token_ttl_sec: number;
  invite_ttl_hours: number;
  max_group_participants: number;
  ghost_grace_sec: number;
  ghost_miss_ticks: number;
  features: CallFeatureFlags;
  allowed_roles: AppRole[];
  status_labels: {
    call: Record<CallStatusId, string>;
    participant: Record<CallParticipantStatusId, string>;
    end_reason: Record<CallEndReasonId, string>;
  };
}

export interface CallStatusCatalogEntry {
  id: string;
  label: string;
  default_label: string;
  kind: 'call' | 'participant' | 'end_reason';
  description: string;
}

export interface CallSettingsAdminView {
  enabled: boolean | null;
  effective_enabled: boolean;
  enabled_source: 'db' | 'env';
  env_calls_enabled: boolean;
  livekit: {
    api_key_masked: string | null;
    has_api_key: boolean;
    api_key_source: 'db' | 'env' | 'none';
    has_api_secret: boolean;
    api_secret_source: 'db' | 'env' | 'none';
    internal_url: string;
    internal_url_source: 'db' | 'env' | 'none';
    public_url: string;
    public_url_source: 'db' | 'env' | 'none';
    configured: boolean;
    probe: { ok: boolean; url?: string; error?: string; configured: boolean } | null;
  };
  ring_timeout_sec: number;
  token_ttl_sec: number;
  invite_ttl_hours: number;
  max_group_participants: number;
  ghost_grace_sec: number;
  ghost_miss_ticks: number;
  /** null в документе = значение из env/default; для UI отдаём effective */
  overrides: {
    ring_timeout_sec: number | null;
    token_ttl_sec: number | null;
    invite_ttl_hours: number | null;
    max_group_participants: number | null;
    ghost_grace_sec: number | null;
    ghost_miss_ticks: number | null;
    livekit_internal_url: string | null;
    livekit_public_url: string | null;
  };
  features: CallFeatureFlags;
  allowed_roles: AppRole[];
  role_catalog: Array<{ id: AppRole; label: string }>;
  status_catalog: CallStatusCatalogEntry[];
  status_labels: CallSettingsDocument['status_labels'];
  limits: {
    ring_timeout_sec: { min: number; max: number; default: number };
    token_ttl_sec: { min: number; max: number; default: number };
    invite_ttl_hours: { min: number; max: number; default: number };
    max_group_participants: { min: number; max: number; default: number };
    ghost_grace_sec: { min: number; max: number; default: number };
    ghost_miss_ticks: { min: number; max: number; default: number };
  };
}

const ROLE_LABELS: Record<AppRole, string> = {
  parishioner: 'Прихожанин',
  member: 'Член церкви',
  minister: 'Служитель',
  pastor: 'Пастор',
  musician: 'Музыкант',
  editor: 'Редактор',
  admin: 'Администратор',
};

const CALL_STATUS_DESCRIPTIONS: Record<CallStatusId, string> = {
  ringing: 'Исходящий звонок ожидает ответа',
  waiting: 'Комната создана, ждём участников (группа / ссылка)',
  active: 'Есть хотя бы один подключённый участник',
  ended: 'Успешно завершён',
  declined: 'Адресат отклонил',
  missed: 'Не дозвонились / таймаут гудков',
  cancelled: 'Инициатор отменил до ответа',
  failed: 'Технический сбой',
};

const PARTICIPANT_STATUS_DESCRIPTIONS: Record<CallParticipantStatusId, string> = {
  invited: 'Добавлен в список участников',
  ringing: 'Идёт входящий вызов',
  joined: 'Подключён к медиа-комнате',
  left: 'Покинул звонок',
  declined: 'Отклонил входящий',
  missed: 'Не ответил вовремя',
  busy: 'Уже в другом звонке',
};

const END_REASON_DESCRIPTIONS: Record<CallEndReasonId, string> = {
  ended: 'Участники завершили звонок',
  ended_by_moderator: 'Модератор завершил для всех',
  declined: 'Отклонён',
  cancelled: 'Отменён до соединения',
  no_answer: 'Истёк ring timeout',
  all_left: 'Последний участник вышел',
  ghost_cleanup: 'Cron убрал «зависших» без LiveKit presence',
  expired_empty: 'Комната пустовала слишком долго',
  stale_direct: 'Прямой звонок протух без ответа',
  livekit_unavailable: 'Не удалось создать/подключить LiveKit',
  failed: 'Прочая ошибка',
};

export function defaultCallFeatures(): CallFeatureFlags {
  return {
    direct_calls: true,
    group_calls: true,
    link_meetings: true,
    audio: true,
    video: true,
  };
}

export function defaultCallSettingsDocument(): CallSettingsDocument {
  return {
    enabled: null,
    livekit: {
      api_key: null,
      api_secret: null,
      internal_url: null,
      public_url: null,
    },
    ring_timeout_sec: null,
    token_ttl_sec: null,
    invite_ttl_hours: null,
    max_group_participants: null,
    ghost_grace_sec: null,
    ghost_miss_ticks: null,
    features: defaultCallFeatures(),
    allowed_roles: [...APP_ROLE_IDS],
    status_labels: { call: {}, participant: {}, end_reason: {} },
  };
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function optionalClampedInt(
  raw: unknown,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function optionalString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function normalizeRole(raw: unknown): AppRole | null {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (APP_ROLE_IDS as readonly string[]).includes(v) ? (v as AppRole) : null;
}

function normalizeFeatures(raw: unknown): CallFeatureFlags {
  const d = defaultCallFeatures();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    direct_calls: typeof o.direct_calls === 'boolean' ? o.direct_calls : d.direct_calls,
    group_calls: typeof o.group_calls === 'boolean' ? o.group_calls : d.group_calls,
    link_meetings: typeof o.link_meetings === 'boolean' ? o.link_meetings : d.link_meetings,
    audio: typeof o.audio === 'boolean' ? o.audio : d.audio,
    video: typeof o.video === 'boolean' ? o.video : d.video,
  };
}

function normalizeLabelMap<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): Partial<Record<T, string>> {
  const out: Partial<Record<T, string>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const id of allowed) {
    const v = o[id];
    if (typeof v === 'string' && v.trim()) {
      out[id] = v.trim().slice(0, 80);
    }
  }
  return out;
}

export function normalizeCallSettingsDocument(raw: unknown): CallSettingsDocument {
  const defaults = defaultCallSettingsDocument();
  if (!raw || typeof raw !== 'object') return defaults;
  const o = raw as Record<string, unknown>;

  let enabled: boolean | null = null;
  if (o.enabled === true || o.enabled === false) enabled = o.enabled;
  else if (o.enabled === null) enabled = null;

  const lkRaw =
    o.livekit && typeof o.livekit === 'object' ? (o.livekit as Record<string, unknown>) : {};

  const rolesRaw = Array.isArray(o.allowed_roles) ? o.allowed_roles : defaults.allowed_roles;
  const allowed_roles: AppRole[] = [];
  for (const item of rolesRaw) {
    const role = normalizeRole(item);
    if (role && !allowed_roles.includes(role)) allowed_roles.push(role);
  }

  const labelsRaw =
    o.status_labels && typeof o.status_labels === 'object'
      ? (o.status_labels as Record<string, unknown>)
      : {};

  return {
    enabled,
    livekit: {
      api_key: optionalString(lkRaw.api_key),
      api_secret: optionalString(lkRaw.api_secret),
      internal_url: optionalString(lkRaw.internal_url),
      public_url: optionalString(lkRaw.public_url),
    },
    ring_timeout_sec: optionalClampedInt(o.ring_timeout_sec, 15, 180),
    token_ttl_sec: optionalClampedInt(o.token_ttl_sec, 60, 28_800),
    invite_ttl_hours: optionalClampedInt(o.invite_ttl_hours, 1, 168),
    max_group_participants: optionalClampedInt(o.max_group_participants, 2, 200),
    ghost_grace_sec: optionalClampedInt(o.ghost_grace_sec, 60, 600),
    ghost_miss_ticks: optionalClampedInt(o.ghost_miss_ticks, 2, 8),
    features: normalizeFeatures(o.features),
    allowed_roles: allowed_roles.length > 0 ? allowed_roles : [...APP_ROLE_IDS],
    status_labels: {
      call: normalizeLabelMap(labelsRaw.call, CALL_STATUS_IDS),
      participant: normalizeLabelMap(labelsRaw.participant, CALL_PARTICIPANT_STATUS_IDS),
      end_reason: normalizeLabelMap(labelsRaw.end_reason, CALL_END_REASON_IDS),
    },
  };
}

function envBoolTrue(name: string): boolean {
  return String(process.env[name] ?? '').trim() === 'true';
}

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) ? n : fallback;
}

function envString(name: string): string {
  return String(process.env[name] ?? '').trim();
}

function maskSecret(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 8) return '••••••••';
  return `${raw.slice(0, 4)}…${raw.slice(-3)}`;
}

function mergeLabels<T extends string>(
  defaults: Record<T, string>,
  overrides: Partial<Record<T, string>>,
): Record<T, string> {
  return { ...defaults, ...overrides };
}

export function buildCallRuntimeConfig(doc: CallSettingsDocument): CallRuntimeConfig {
  const envEnabled = envBoolTrue('CALLS_ENABLED');
  const enabled = doc.enabled === null ? envEnabled : doc.enabled;
  const enabled_source: 'db' | 'env' = doc.enabled === null ? 'env' : 'db';

  const envKey = envString('LIVEKIT_API_KEY');
  const envSecret = envString('LIVEKIT_API_SECRET');
  const envInternal = envString('LIVEKIT_URL');
  const envPublic = envString('LIVEKIT_PUBLIC_URL');

  const api_key = doc.livekit.api_key || envKey;
  const api_secret = doc.livekit.api_secret || envSecret;
  const internal_url = doc.livekit.internal_url || envInternal;
  const public_url = doc.livekit.public_url || envPublic;

  return {
    enabled,
    enabled_source,
    livekit: {
      api_key,
      api_secret,
      internal_url,
      public_url,
      configured: Boolean(api_key && api_secret && internal_url),
      api_key_source: doc.livekit.api_key ? 'db' : envKey ? 'env' : 'none',
      api_secret_source: doc.livekit.api_secret ? 'db' : envSecret ? 'env' : 'none',
      internal_url_source: doc.livekit.internal_url ? 'db' : envInternal ? 'env' : 'none',
      public_url_source: doc.livekit.public_url ? 'db' : envPublic ? 'env' : 'none',
    },
    ring_timeout_sec: clampInt(
      doc.ring_timeout_sec ?? envNumber('CALL_RING_TIMEOUT_SEC', 60),
      15,
      180,
      60,
    ),
    token_ttl_sec: clampInt(
      doc.token_ttl_sec ?? envNumber('CALL_TOKEN_TTL_SEC', 14_400),
      60,
      28_800,
      14_400,
    ),
    invite_ttl_hours: clampInt(
      doc.invite_ttl_hours ?? envNumber('CALL_INVITE_TTL_HOURS', 24),
      1,
      168,
      24,
    ),
    max_group_participants: clampInt(
      doc.max_group_participants ?? envNumber('CALL_MAX_GROUP_PARTICIPANTS', 50),
      2,
      200,
      50,
    ),
    ghost_grace_sec: clampInt(
      doc.ghost_grace_sec ?? envNumber('CALL_GHOST_GRACE_SEC', 180),
      60,
      600,
      180,
    ),
    ghost_miss_ticks: clampInt(
      doc.ghost_miss_ticks ?? envNumber('CALL_GHOST_MISS_TICKS', 3),
      2,
      8,
      3,
    ),
    features: doc.features,
    allowed_roles: doc.allowed_roles,
    status_labels: {
      call: mergeLabels(DEFAULT_CALL_STATUS_LABELS, doc.status_labels.call),
      participant: mergeLabels(DEFAULT_PARTICIPANT_STATUS_LABELS, doc.status_labels.participant),
      end_reason: mergeLabels(DEFAULT_END_REASON_LABELS, doc.status_labels.end_reason),
    },
  };
}

export function buildCallStatusCatalog(doc: CallSettingsDocument): CallStatusCatalogEntry[] {
  const runtime = buildCallRuntimeConfig(doc);
  const entries: CallStatusCatalogEntry[] = [];
  for (const id of CALL_STATUS_IDS) {
    entries.push({
      id,
      kind: 'call',
      label: runtime.status_labels.call[id],
      default_label: DEFAULT_CALL_STATUS_LABELS[id],
      description: CALL_STATUS_DESCRIPTIONS[id],
    });
  }
  for (const id of CALL_PARTICIPANT_STATUS_IDS) {
    entries.push({
      id,
      kind: 'participant',
      label: runtime.status_labels.participant[id],
      default_label: DEFAULT_PARTICIPANT_STATUS_LABELS[id],
      description: PARTICIPANT_STATUS_DESCRIPTIONS[id],
    });
  }
  for (const id of CALL_END_REASON_IDS) {
    entries.push({
      id,
      kind: 'end_reason',
      label: runtime.status_labels.end_reason[id],
      default_label: DEFAULT_END_REASON_LABELS[id],
      description: END_REASON_DESCRIPTIONS[id],
    });
  }
  return entries;
}

export function buildCallSettingsAdminView(
  doc: CallSettingsDocument,
  probe: CallSettingsAdminView['livekit']['probe'] = null,
): CallSettingsAdminView {
  const runtime = buildCallRuntimeConfig(doc);
  return {
    enabled: doc.enabled,
    effective_enabled: runtime.enabled,
    enabled_source: runtime.enabled_source,
    env_calls_enabled: envBoolTrue('CALLS_ENABLED'),
    livekit: {
      api_key_masked: maskSecret(runtime.livekit.api_key || null),
      has_api_key: Boolean(runtime.livekit.api_key),
      api_key_source: runtime.livekit.api_key_source,
      has_api_secret: Boolean(runtime.livekit.api_secret),
      api_secret_source: runtime.livekit.api_secret_source,
      internal_url: runtime.livekit.internal_url,
      internal_url_source: runtime.livekit.internal_url_source,
      public_url: runtime.livekit.public_url,
      public_url_source: runtime.livekit.public_url_source,
      configured: runtime.livekit.configured,
      probe,
    },
    ring_timeout_sec: runtime.ring_timeout_sec,
    token_ttl_sec: runtime.token_ttl_sec,
    invite_ttl_hours: runtime.invite_ttl_hours,
    max_group_participants: runtime.max_group_participants,
    ghost_grace_sec: runtime.ghost_grace_sec,
    ghost_miss_ticks: runtime.ghost_miss_ticks,
    overrides: {
      ring_timeout_sec: doc.ring_timeout_sec,
      token_ttl_sec: doc.token_ttl_sec,
      invite_ttl_hours: doc.invite_ttl_hours,
      max_group_participants: doc.max_group_participants,
      ghost_grace_sec: doc.ghost_grace_sec,
      ghost_miss_ticks: doc.ghost_miss_ticks,
      livekit_internal_url: doc.livekit.internal_url,
      livekit_public_url: doc.livekit.public_url,
    },
    features: runtime.features,
    allowed_roles: runtime.allowed_roles,
    role_catalog: APP_ROLE_IDS.map((id) => ({ id, label: ROLE_LABELS[id] })),
    status_catalog: buildCallStatusCatalog(doc),
    status_labels: doc.status_labels,
    limits: {
      ring_timeout_sec: { min: 15, max: 180, default: 60 },
      token_ttl_sec: { min: 60, max: 28_800, default: 14_400 },
      invite_ttl_hours: { min: 1, max: 168, default: 24 },
      max_group_participants: { min: 2, max: 200, default: 50 },
      ghost_grace_sec: { min: 60, max: 600, default: 180 },
      ghost_miss_ticks: { min: 2, max: 8, default: 3 },
    },
  };
}

export function isAppRoleAllowedForCalls(roleRaw: string | null | undefined, allowed: AppRole[]): boolean {
  const role = normalizeRole(roleRaw) ?? 'member';
  return (
    allowed.includes(role) ||
    (role === 'parishioner' && allowed.includes('member'))
  );
}
