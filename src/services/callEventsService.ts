import { query } from '../config/db';
import {
  DEFAULT_CALL_STATUS_LABELS,
  DEFAULT_END_REASON_LABELS,
  type CallStatusId,
} from '../types/callSettings';
import { getCallRuntimeConfig } from './callSettingsService';
import { extractQuality, memberDisplayName, type CallQualityReport } from './callStatsService';

export type CallEventSource = 'server' | 'client';
export type CallEventSeverity = 'info' | 'warn' | 'error';

export type CallEventRecord = {
  id: number;
  callId: string;
  memberId: number | null;
  memberName: string | null;
  source: CallEventSource;
  kind: string;
  severity: CallEventSeverity;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CallIssue = {
  code: string;
  severity: CallEventSeverity;
  title: string;
  hint: string;
};

/** Клиентские события: allowlist kind → severity по умолчанию. */
export const CLIENT_CALL_EVENT_KINDS: Readonly<Record<string, CallEventSeverity>> = {
  connecting: 'info',
  connected: 'info',
  reconnecting: 'warn',
  reconnected: 'info',
  signal_reconnecting: 'warn',
  disconnected: 'warn',
  rejoin_attempt: 'warn',
  rejoin_abandoned: 'error',
  quality_changed: 'info',
  stats_sample: 'info',
  device_error: 'error',
  room_error: 'error',
  media_toggle: 'info',
  network_changed: 'warn',
  audio_playback_blocked: 'warn',
  participant_joined: 'info',
  participant_left: 'info',
  token_refresh: 'info',
};

const MAX_CLIENT_BATCH = 100;
const MAX_CLIENT_EVENTS_PER_CALL = 3000;
const MAX_PAYLOAD_CHARS = 1500;
const CLIENT_TS_SKEW_PAST_MS = 2 * 60 * 60 * 1000;
const CLIENT_TS_SKEW_FUTURE_MS = 5 * 60 * 1000;

export type ClientCallEventInput = {
  kind: string;
  severity: CallEventSeverity;
  at: Date;
  payload: Record<string, unknown>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Плоская санитизация payload: скаляры + короткие массивы скаляров, лимит размера. */
export function sanitizeClientPayload(raw: unknown): Record<string, unknown> {
  if (!isPlainObject(raw)) return {};
  const out: Record<string, unknown> = {};
  let size = 2; // {}
  for (const [key, value] of Object.entries(raw)) {
    if (out[key] !== undefined || Object.keys(out).length >= 40) break;
    const k = key.slice(0, 64);
    let v: unknown = null;
    if (typeof value === 'string') v = value.slice(0, 300);
    else if (typeof value === 'number' && Number.isFinite(value)) v = Math.round(value * 1000) / 1000;
    else if (typeof value === 'boolean') v = value;
    else if (Array.isArray(value)) {
      v = value
        .slice(0, 20)
        .map((item) =>
          typeof item === 'string'
            ? item.slice(0, 120)
            : typeof item === 'number' && Number.isFinite(item)
              ? Math.round(item * 1000) / 1000
              : typeof item === 'boolean'
                ? item
                : null,
        );
    } else if (isPlainObject(value)) {
      const s = JSON.stringify(value);
      v = s.length <= 300 ? value : s.slice(0, 300);
    }
    const entrySize = k.length + JSON.stringify(v).length + 2;
    if (size + entrySize > MAX_PAYLOAD_CHARS) break;
    out[k] = v;
    size += entrySize;
  }
  return out;
}

/** Валидация одного клиентского события. Возвращает null, если событие отклонено. */
export function sanitizeClientEvent(raw: unknown, nowMs = Date.now()): ClientCallEventInput | null {
  if (!isPlainObject(raw)) return null;
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().slice(0, 64) : '';
  if (!kind || !(kind in CLIENT_CALL_EVENT_KINDS)) return null;
  let severity: CallEventSeverity = CLIENT_CALL_EVENT_KINDS[kind];
  if (raw.severity === 'info' || raw.severity === 'warn' || raw.severity === 'error') {
    severity = raw.severity;
  }
  let at = new Date(nowMs);
  if (typeof raw.at === 'string') {
    const parsed = new Date(raw.at);
    const ms = parsed.getTime();
    if (
      !Number.isNaN(ms) &&
      ms >= nowMs - CLIENT_TS_SKEW_PAST_MS &&
      ms <= nowMs + CLIENT_TS_SKEW_FUTURE_MS
    ) {
      at = parsed;
    }
  }
  return { kind, severity, at, payload: sanitizeClientPayload(raw.payload) };
}

/** Fire-and-forget запись серверного события. Никогда не бросает. */
export function recordCallEvent(input: {
  callId: string;
  memberId?: number | null;
  kind: string;
  severity?: CallEventSeverity;
  payload?: Record<string, unknown>;
}): void {
  let payload = '{}';
  try {
    const s = JSON.stringify(input.payload ?? {});
    if (s.length <= 4000) payload = s;
  } catch {
    /* keep {} */
  }
  void query(
    `INSERT INTO call_events (call_id, member_id, source, kind, severity, payload)
     VALUES ($1::uuid, $2, 'server', $3, $4, $5::jsonb)`,
    [
      input.callId,
      input.memberId != null && Number.isFinite(input.memberId) ? input.memberId : null,
      input.kind.slice(0, 64),
      input.severity ?? 'info',
      payload,
    ],
  ).catch((e) => console.warn('[call-events] record failed:', e instanceof Error ? e.message : e));
}

/** Пакетная запись клиентских событий. Возвращает число принятых событий. */
export async function recordClientCallEvents(
  callId: string,
  memberId: number,
  rawEvents: unknown,
): Promise<{ accepted: number }> {
  const memberCheck = await query(
    `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 LIMIT 1`,
    [callId, memberId],
  );
  if (memberCheck.rows.length === 0) {
    const err = new Error('Вы не участник этого звонка');
    (err as Error & { code?: string }).code = 'forbidden';
    throw err;
  }

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) return { accepted: 0 };

  const countRes = await query(
    `SELECT COUNT(*)::int AS c FROM call_events WHERE call_id = $1::uuid AND source = 'client'`,
    [callId],
  );
  const existing = Number(countRes.rows[0]?.c ?? 0);
  let budget = Math.max(0, MAX_CLIENT_EVENTS_PER_CALL - existing);
  if (budget === 0) return { accepted: 0 };

  const nowMs = Date.now();
  const events: ClientCallEventInput[] = [];
  for (const raw of rawEvents.slice(0, MAX_CLIENT_BATCH)) {
    const ev = sanitizeClientEvent(raw, nowMs);
    if (!ev) continue;
    if (budget <= 0) break;
    events.push(ev);
    budget -= 1;
  }
  if (events.length === 0) return { accepted: 0 };

  const values: string[] = [];
  const params: unknown[] = [];
  events.forEach((ev, i) => {
    const b = i * 6;
    values.push(`($${b + 1}::uuid, $${b + 2}, 'client', $${b + 3}, $${b + 4}, $${b + 5}::jsonb, $${b + 6}::timestamptz)`);
    params.push(callId, memberId, ev.kind, ev.severity, JSON.stringify(ev.payload), ev.at.toISOString());
  });
  await query(
    `INSERT INTO call_events (call_id, member_id, source, kind, severity, payload, created_at)
     VALUES ${values.join(', ')}`,
    params,
  );
  return { accepted: events.length };
}

// ---------------------------------------------------------------------------
// Ретенция журнала: ежесуточная батч-очистка (вызывается из cron, не из hot path)
// ---------------------------------------------------------------------------

const RETENTION_BATCH_SIZE = 5000;
/** Потолок батчей за прогон (5000 × 200 = 1 млн строк) — защита от бесконечного цикла под нагрузкой. */
const RETENTION_MAX_BATCHES = 200;

/** Срок хранения событий журнала в днях: CALL_JOURNAL_RETENTION_DAYS, по умолчанию 90. */
export function getCallJournalRetentionDays(): number {
  const raw = Number(process.env.CALL_JOURNAL_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) return 90;
  return Math.min(3650, Math.floor(raw));
}

/**
 * Удаляет события старше retentionDays батчами по RETENTION_BATCH_SIZE строк:
 * короткие транзакции — без длинных блокировок и всплесков WAL, которые дал бы
 * один большой DELETE. Возвращает общее число удалённых строк.
 */
export async function deleteExpiredCallEvents(
  retentionDays = getCallJournalRetentionDays(),
): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  let total = 0;
  for (let batch = 0; batch < RETENTION_MAX_BATCHES; batch += 1) {
    const res = await query(
      `DELETE FROM call_events
       WHERE ctid IN (
         SELECT ctid FROM call_events WHERE created_at < $1::timestamptz LIMIT $2
       )`,
      [cutoff, RETENTION_BATCH_SIZE],
    );
    const deleted = Number(res.rowCount ?? 0);
    total += deleted;
    if (deleted < RETENTION_BATCH_SIZE) break;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Аналитика проблем (pure — покрыто тестами)
// ---------------------------------------------------------------------------

export type CallIssueInput = {
  status: string;
  endReason: string | null;
  type: string;
  createdAt: string;
  startedAt: string | null;
  durationSeconds: number | null;
  reconnects: number;
  deviceErrors: number;
  roomErrors: number;
  audioBlocked: number;
  ghostCleared: number;
  tokenIssued: boolean;
  clientConnected: boolean;
  hasClientEvents: boolean;
  minQualityScore: number | null;
  qualityReports: number;
};

const RECONNECT_STORM_THRESHOLD = 4;
const SHORT_TALK_SEC = 15;
const LONG_RING_SEC = 20;

/** Вычисляет список проблем/наблюдений по звонку из агрегатов событий. */
export function deriveCallIssues(input: CallIssueInput): CallIssue[] {
  const issues: CallIssue[] = [];
  const finished = ['ended', 'missed', 'declined', 'cancelled', 'failed'].includes(input.status);

  if (input.status === 'failed') {
    issues.push({
      code: 'call_failed',
      severity: 'error',
      title: 'Звонок не состоялся',
      hint:
        input.endReason === 'livekit_unavailable'
          ? 'Сервер LiveKit был недоступен при создании комнаты. Проверьте контейнер livekit и настройки подключения (кнопка «Проверить подключение» в настройках звонков).'
          : 'Звонок завершился с ошибкой до начала разговора. Смотрите события ниже.',
    });
  }

  if (input.endReason === 'livekit_unavailable' && input.status !== 'failed') {
    issues.push({
      code: 'livekit_unavailable',
      severity: 'error',
      title: 'LiveKit был недоступен',
      hint: 'Проверьте контейнер livekit, порты 7880/7881 и диапазон UDP-портов в docker/livekit.yaml.',
    });
  }

  if (input.endReason === 'ghost_cleanup' || input.ghostCleared > 0) {
    issues.push({
      code: 'ghost_cleanup',
      severity: 'warn',
      title:
        input.ghostCleared > 0
          ? `«Призрачные» участники удалены (${input.ghostCleared})`
          : 'Звонок завершён автоочисткой призраков',
      hint: 'Клиент пропал из LiveKit без сигнала выхода — обычно закрытая вкладка, свёрнутое Android-приложение или обрыв сети. Если повторяется у одного участника — проблема на его устройстве/сети.',
    });
  }

  if (input.endReason === 'expired_empty') {
    issues.push({
      code: 'expired_empty',
      severity: 'warn',
      title: 'Встреча истекла без участников',
      hint: 'Никто не подключился за 2 часа. Если ссылка не дошла до людей — проверьте, как она распространялась.',
    });
  }

  if (input.endReason === 'stale_direct') {
    issues.push({
      code: 'stale_direct',
      severity: 'warn',
      title: 'Зависший звонок закрыт автоочисткой',
      hint: 'Звонок оставался активным 30+ минут без подключённых участников — обе стороны пропали без корректного завершения.',
    });
  }

  if (
    finished &&
    input.tokenIssued &&
    input.hasClientEvents &&
    !input.clientConnected &&
    input.status !== 'cancelled' &&
    input.status !== 'declined' &&
    input.status !== 'missed'
  ) {
    issues.push({
      code: 'media_never_connected',
      severity: 'error',
      title: 'Медиаподключение не установлено',
      hint: 'Клиент получил токен, но так и не подключился к комнате LiveKit. Типичные причины: блокировка UDP/WebRTC в сети участника, отсутствие TURN, агрессивный файрвол. Проверьте порты 7881 и UDP-диапазон.',
    });
  }

  if (input.reconnects >= RECONNECT_STORM_THRESHOLD) {
    issues.push({
      code: 'reconnect_storm',
      severity: 'warn',
      title: `Частые переподключения (${input.reconnects})`,
      hint: 'Соединение участника рвалось многократно — нестабильная сеть или переход Wi‑Fi ↔ LTE. Если массово — проверяйте TURN и UDP-доступность сервера.',
    });
  }

  if (input.deviceErrors > 0) {
    issues.push({
      code: 'device_error',
      severity: 'error',
      title: `Ошибка микрофона/камеры (${input.deviceErrors})`,
      hint: 'У участника не получилось получить доступ к устройству: нет разрешения в браузере/ОС, устройство занято другим приложением или отсутствует.',
    });
  }

  if (input.roomErrors > 0) {
    issues.push({
      code: 'room_error',
      severity: 'error',
      title: `Ошибка медиасервера на клиенте (${input.roomErrors})`,
      hint: 'LiveKit-клиент сообщил об ошибке комнаты. Детали — в событиях room_error ниже.',
    });
  }

  if (input.audioBlocked > 0) {
    issues.push({
      code: 'audio_blocked',
      severity: 'warn',
      title: 'Браузер заблокировал воспроизведение звука',
      hint: 'Autoplay-политика браузера: участнику нужно нажать на страницу звонка, чтобы заработал звук.',
    });
  }

  if (input.minQualityScore != null && input.minQualityScore <= 2) {
    issues.push({
      code: 'low_quality',
      severity: 'warn',
      title: `Низкая оценка качества (${input.minQualityScore}/5)`,
      hint: 'Участник отметил плохое качество. Смотрите RTT/джиттер/потери в сэмплах stats_sample и отчётах качества.',
    });
  }

  if (
    input.status === 'ended' &&
    input.durationSeconds != null &&
    input.durationSeconds > 0 &&
    input.durationSeconds < SHORT_TALK_SEC
  ) {
    issues.push({
      code: 'short_talk',
      severity: 'info',
      title: `Очень короткий разговор (${input.durationSeconds} с)`,
      hint: 'Часто означает «не слышно/не видно» сразу после подключения. Проверьте device_error и audio_blocked в событиях.',
    });
  }

  if (input.type === 'direct' && input.startedAt) {
    const ringSec = (new Date(input.startedAt).getTime() - new Date(input.createdAt).getTime()) / 1000;
    if (ringSec > LONG_RING_SEC) {
      issues.push({
        code: 'long_ring',
        severity: 'info',
        title: `Долгое ожидание ответа (${Math.round(ringSec)} с)`,
        hint: 'Абонент отвечал долго — возможно, push-уведомление пришло с задержкой или приложение было закрыто.',
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Админский журнал
// ---------------------------------------------------------------------------

export type CallJournalQuery = {
  from?: string;
  to?: string;
  status?: string;
  memberQuery?: string;
  onlyIssues?: boolean;
  cursor?: string;
  limit?: number;
};

export type CallJournalItem = {
  id: string;
  type: string;
  mediaType: string;
  status: string;
  statusLabel: string;
  accessMode: string;
  title: string | null;
  initiatedBy: number;
  initiatorName: string;
  initiatorAvatar: string | null;
  conversationId: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: string | null;
  endReasonLabel: string | null;
  qualityScore: number | null;
  participantsCount: number;
  eventsCount: number;
  warnCount: number;
  errorCount: number;
  reconnects: number;
  lastEventAt: string | null;
  issues: CallIssue[];
};

type JournalRow = Record<string, unknown> & {
  metadata?: unknown;
};

function parseDayBound(raw: string | undefined, fallback: Date): Date {
  if (!raw || !String(raw).trim()) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

const EVENT_AGGREGATES_SQL = `
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS events_count,
      COUNT(*) FILTER (WHERE e.severity = 'warn') AS warn_count,
      COUNT(*) FILTER (WHERE e.severity = 'error') AS error_count,
      COUNT(*) FILTER (WHERE e.kind IN ('reconnecting', 'signal_reconnecting', 'rejoin_attempt')) AS reconnects,
      COUNT(*) FILTER (WHERE e.kind = 'device_error') AS device_errors,
      COUNT(*) FILTER (WHERE e.kind = 'room_error') AS room_errors,
      COUNT(*) FILTER (WHERE e.kind = 'audio_playback_blocked') AS audio_blocked,
      COUNT(*) FILTER (WHERE e.kind = 'ghost_cleared') AS ghost_cleared,
      BOOL_OR(e.kind = 'token_issued') AS token_issued,
      BOOL_OR(e.kind = 'connected' AND e.source = 'client') AS client_connected,
      BOOL_OR(e.source = 'client') AS has_client_events,
      MAX(e.created_at) AS last_event_at
    FROM call_events e
    WHERE e.call_id = c.id
  ) agg ON TRUE`;

function rowToIssueInput(row: JournalRow): CallIssueInput {
  const { score, reports } = extractQuality(row.metadata);
  let minQuality: number | null = null;
  for (const r of reports) {
    if (minQuality == null || r.score < minQuality) minQuality = r.score;
  }
  if (minQuality == null && score != null && reports.length === 0) minQuality = score;
  return {
    status: String(row.status),
    endReason: row.end_reason != null ? String(row.end_reason) : null,
    type: String(row.type),
    createdAt: new Date(String(row.created_at)).toISOString(),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    durationSeconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    reconnects: Number(row.reconnects ?? 0),
    deviceErrors: Number(row.device_errors ?? 0),
    roomErrors: Number(row.room_errors ?? 0),
    audioBlocked: Number(row.audio_blocked ?? 0),
    ghostCleared: Number(row.ghost_cleared ?? 0),
    tokenIssued: Boolean(row.token_issued),
    clientConnected: Boolean(row.client_connected),
    hasClientEvents: Boolean(row.has_client_events),
    minQualityScore: minQuality,
    qualityReports: reports.length,
  };
}

export async function listCallJournal(
  input: CallJournalQuery = {},
): Promise<{ items: CallJournalItem[]; nextCursor: string | null }> {
  const runtime = await getCallRuntimeConfig();
  const to = parseDayBound(input.to, new Date());
  const from = parseDayBound(input.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
  const limit = Math.max(1, Math.min(100, input.limit ?? 30));

  const params: unknown[] = [from.toISOString(), to.toISOString()];
  let filters = '';

  if (input.status && String(input.status).trim() && input.status !== 'all') {
    params.push(String(input.status).trim());
    filters += ` AND c.status = $${params.length}`;
  }

  const memberQuery = input.memberQuery?.trim();
  if (memberQuery) {
    params.push(`%${memberQuery.replace(/[%_]/g, '')}%`);
    const p = `$${params.length}`;
    filters += ` AND (
      mb.first_name ILIKE ${p} OR mb.last_name ILIKE ${p} OR mb.name ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM call_participants cpq
        JOIN members mq ON mq.id = cpq.user_id
        WHERE cpq.call_id = c.id
          AND (mq.first_name ILIKE ${p} OR mq.last_name ILIKE ${p} OR mq.name ILIKE ${p})
      )
    )`;
  }

  if (input.onlyIssues) {
    filters += ` AND (
      c.status = 'failed'
      OR c.end_reason IN ('livekit_unavailable', 'stale_direct', 'expired_empty', 'ghost_cleanup')
      OR COALESCE(agg.reconnects, 0) >= ${RECONNECT_STORM_THRESHOLD}
      OR COALESCE(agg.device_errors, 0) > 0
      OR COALESCE(agg.room_errors, 0) > 0
      OR COALESCE(agg.audio_blocked, 0) > 0
      OR COALESCE(agg.ghost_cleared, 0) > 0
      OR (
        COALESCE(agg.token_issued, FALSE)
        AND COALESCE(agg.has_client_events, FALSE)
        AND NOT COALESCE(agg.client_connected, FALSE)
        AND c.status IN ('ended', 'failed')
      )
      OR (
        jsonb_typeof(c.metadata -> 'quality' -> 'reports') = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.metadata -> 'quality' -> 'reports') r
          WHERE (r ->> 'score')::numeric <= 2
        )
      )
    )`;
  }

  if (input.cursor) {
    const sep = input.cursor.indexOf('|');
    if (sep > 0) {
      const cursorTs = input.cursor.slice(0, sep);
      const cursorId = input.cursor.slice(sep + 1);
      const d = new Date(cursorTs);
      if (!Number.isNaN(d.getTime()) && cursorId) {
        params.push(d.toISOString(), cursorId);
        filters += ` AND (c.created_at, c.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
      }
    }
  }

  params.push(limit + 1);
  const res = await query(
    `SELECT c.*,
            mb.first_name AS initiator_first_name,
            mb.last_name AS initiator_last_name,
            mb.name AS initiator_name_raw,
            mb.avatar_url AS initiator_avatar,
            COALESCE(agg.events_count, 0)::int AS events_count,
            COALESCE(agg.warn_count, 0)::int AS warn_count,
            COALESCE(agg.error_count, 0)::int AS error_count,
            COALESCE(agg.reconnects, 0)::int AS reconnects,
            COALESCE(agg.device_errors, 0)::int AS device_errors,
            COALESCE(agg.room_errors, 0)::int AS room_errors,
            COALESCE(agg.audio_blocked, 0)::int AS audio_blocked,
            COALESCE(agg.ghost_cleared, 0)::int AS ghost_cleared,
            COALESCE(agg.token_issued, FALSE) AS token_issued,
            COALESCE(agg.client_connected, FALSE) AS client_connected,
            COALESCE(agg.has_client_events, FALSE) AS has_client_events,
            agg.last_event_at AS last_event_at,
            (SELECT COUNT(*)::int FROM call_participants cp WHERE cp.call_id = c.id) AS participants_count
     FROM calls c
     JOIN members mb ON mb.id = c.initiated_by
     ${EVENT_AGGREGATES_SQL}
     WHERE c.created_at >= $1::timestamptz AND c.created_at <= $2::timestamptz
     ${filters}
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT $${params.length}`,
    params,
  );

  const rows = res.rows.slice(0, limit);
  const items: CallJournalItem[] = rows.map((row: JournalRow) => {
    const status = String(row.status);
    const endReason = row.end_reason != null ? String(row.end_reason) : null;
    const meta = row.metadata;
    const title =
      meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).title === 'string'
        ? String((meta as Record<string, unknown>).title)
        : null;
    const { score } = extractQuality(meta);
    const issueInput = rowToIssueInput(row);
    return {
      id: String(row.id),
      type: String(row.type),
      mediaType: String(row.media_type),
      status,
      statusLabel:
        runtime.status_labels.call[status as CallStatusId] ||
        DEFAULT_CALL_STATUS_LABELS[status as CallStatusId] ||
        status,
      accessMode: String(row.access_mode || 'closed'),
      title,
      initiatedBy: Number(row.initiated_by),
      initiatorName: memberDisplayName({
        first_name: row.initiator_first_name as string | null,
        last_name: row.initiator_last_name as string | null,
        name: row.initiator_name_raw as string | null,
      }),
      initiatorAvatar: row.initiator_avatar != null ? String(row.initiator_avatar) : null,
      conversationId: row.conversation_id != null ? String(row.conversation_id) : null,
      createdAt: issueInput.createdAt,
      startedAt: issueInput.startedAt,
      endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : null,
      durationSeconds: issueInput.durationSeconds,
      endReason,
      endReasonLabel: endReason
        ? runtime.status_labels.end_reason[endReason as keyof typeof runtime.status_labels.end_reason] ||
          DEFAULT_END_REASON_LABELS[endReason as keyof typeof DEFAULT_END_REASON_LABELS] ||
          endReason
        : null,
      qualityScore: score,
      participantsCount: Number(row.participants_count ?? 0),
      eventsCount: Number(row.events_count ?? 0),
      warnCount: Number(row.warn_count ?? 0),
      errorCount: Number(row.error_count ?? 0),
      reconnects: issueInput.reconnects,
      lastEventAt: row.last_event_at ? new Date(String(row.last_event_at)).toISOString() : null,
      issues: deriveCallIssues(issueInput),
    };
  });

  const hasMore = res.rows.length > limit;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? `${last.createdAt}|${last.id}` : null,
  };
}

export type CallLogParticipant = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
  leftAt: string | null;
};

export type CallLogDetail = {
  call: CallJournalItem & { livekitRoomName: string };
  participants: CallLogParticipant[];
  qualityReports: CallQualityReport[];
  events: CallEventRecord[];
  issues: CallIssue[];
};

export async function getCallLogDetail(callId: string): Promise<CallLogDetail | null> {
  const runtime = await getCallRuntimeConfig();
  const res = await query(
    `SELECT c.*,
            mb.first_name AS initiator_first_name,
            mb.last_name AS initiator_last_name,
            mb.name AS initiator_name_raw,
            mb.avatar_url AS initiator_avatar,
            COALESCE(agg.events_count, 0)::int AS events_count,
            COALESCE(agg.warn_count, 0)::int AS warn_count,
            COALESCE(agg.error_count, 0)::int AS error_count,
            COALESCE(agg.reconnects, 0)::int AS reconnects,
            COALESCE(agg.device_errors, 0)::int AS device_errors,
            COALESCE(agg.room_errors, 0)::int AS room_errors,
            COALESCE(agg.audio_blocked, 0)::int AS audio_blocked,
            COALESCE(agg.ghost_cleared, 0)::int AS ghost_cleared,
            COALESCE(agg.token_issued, FALSE) AS token_issued,
            COALESCE(agg.client_connected, FALSE) AS client_connected,
            COALESCE(agg.has_client_events, FALSE) AS has_client_events,
            agg.last_event_at AS last_event_at,
            (SELECT COUNT(*)::int FROM call_participants cp WHERE cp.call_id = c.id) AS participants_count
     FROM calls c
     JOIN members mb ON mb.id = c.initiated_by
     ${EVENT_AGGREGATES_SQL}
     WHERE c.id = $1::uuid
     LIMIT 1`,
    [callId],
  );
  const row = res.rows[0] as JournalRow | undefined;
  if (!row) return null;

  const [partsRes, eventsRes] = await Promise.all([
    query(
      `SELECT cp.user_id, cp.role, cp.status, cp.invited_at, cp.joined_at, cp.left_at,
              mb.first_name, mb.last_name, mb.name, mb.avatar_url
       FROM call_participants cp
       JOIN members mb ON mb.id = cp.user_id
       WHERE cp.call_id = $1::uuid
       ORDER BY cp.invited_at ASC, cp.user_id ASC`,
      [callId],
    ),
    query(
      `SELECT e.id, e.member_id, e.source, e.kind, e.severity, e.payload, e.created_at,
              mb.first_name, mb.last_name, mb.name
       FROM call_events e
       LEFT JOIN members mb ON mb.id = e.member_id
       WHERE e.call_id = $1::uuid
       ORDER BY e.created_at ASC, e.id ASC
       LIMIT 1000`,
      [callId],
    ),
  ]);

  const meta = row.metadata;
  const title =
    meta && typeof meta === 'object' && typeof (meta as Record<string, unknown>).title === 'string'
      ? String((meta as Record<string, unknown>).title)
      : null;
  const { score, reports } = extractQuality(meta);
  const issueInput = rowToIssueInput(row);
  const issues = deriveCallIssues(issueInput);
  const status = String(row.status);
  const endReason = row.end_reason != null ? String(row.end_reason) : null;

  const call: CallLogDetail['call'] = {
    id: String(row.id),
    type: String(row.type),
    mediaType: String(row.media_type),
    status,
    statusLabel:
      runtime.status_labels.call[status as CallStatusId] ||
      DEFAULT_CALL_STATUS_LABELS[status as CallStatusId] ||
      status,
    accessMode: String(row.access_mode || 'closed'),
    title,
    initiatedBy: Number(row.initiated_by),
    initiatorName: memberDisplayName({
      first_name: row.initiator_first_name as string | null,
      last_name: row.initiator_last_name as string | null,
      name: row.initiator_name_raw as string | null,
    }),
    initiatorAvatar: row.initiator_avatar != null ? String(row.initiator_avatar) : null,
    conversationId: row.conversation_id != null ? String(row.conversation_id) : null,
    createdAt: issueInput.createdAt,
    startedAt: issueInput.startedAt,
    endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : null,
    durationSeconds: issueInput.durationSeconds,
    endReason,
    endReasonLabel: endReason
      ? runtime.status_labels.end_reason[endReason as keyof typeof runtime.status_labels.end_reason] ||
        DEFAULT_END_REASON_LABELS[endReason as keyof typeof DEFAULT_END_REASON_LABELS] ||
        endReason
      : null,
    qualityScore: score,
    participantsCount: Number(row.participants_count ?? 0),
    eventsCount: Number(row.events_count ?? 0),
    warnCount: Number(row.warn_count ?? 0),
    errorCount: Number(row.error_count ?? 0),
    reconnects: issueInput.reconnects,
    lastEventAt: row.last_event_at ? new Date(String(row.last_event_at)).toISOString() : null,
    issues,
    livekitRoomName: String(row.livekit_room_name),
  };

  return {
    call,
    participants: partsRes.rows.map((p) => ({
      userId: Number(p.user_id),
      name: memberDisplayName(p as { first_name?: string; last_name?: string; name?: string }),
      avatarUrl: p.avatar_url != null ? String(p.avatar_url) : null,
      role: String(p.role),
      status: String(p.status),
      invitedAt: new Date(String(p.invited_at)).toISOString(),
      joinedAt: p.joined_at ? new Date(String(p.joined_at)).toISOString() : null,
      leftAt: p.left_at ? new Date(String(p.left_at)).toISOString() : null,
    })),
    qualityReports: reports,
    events: eventsRes.rows.map((e) => ({
      id: Number(e.id),
      callId,
      memberId: e.member_id != null ? Number(e.member_id) : null,
      memberName:
        e.member_id != null
          ? memberDisplayName(e as { first_name?: string; last_name?: string; name?: string })
          : null,
      source: e.source === 'client' ? 'client' : 'server',
      kind: String(e.kind),
      severity:
        e.severity === 'warn' || e.severity === 'error' ? (e.severity as CallEventSeverity) : 'info',
      payload:
        e.payload && typeof e.payload === 'object' && !Array.isArray(e.payload)
          ? (e.payload as Record<string, unknown>)
          : {},
      createdAt: new Date(String(e.created_at)).toISOString(),
    })),
    issues,
  };
}
