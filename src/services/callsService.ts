import { createHash, randomBytes, randomUUID } from 'crypto';

import { pool, query } from '../config/db';
import { encryptMessageText } from '../lib/messageCrypto';
import type { MessageWithSender, WsMessengerEvent } from '../types/messenger';
import {
  getConversationMemberIds,
  getConversationMeta,
  getConversationType,
  isMemberInConversation,
} from './messengerService';
import {
  dismissIncomingCallNative,
  sendIncomingCallWake,
  sendPushNotification,
} from './pushService';
import {
  endLiveKitRoom,
  ensureLiveKitRoom,
  isLiveKitConfigured,
  listLiveKitParticipantIdentities,
  livekitIdentityForMember,
  mintLiveKitJoinToken,
  removeLiveKitParticipant,
} from './livekitService';
import {
  getCallRuntimeConfig,
  peekCallRuntimeConfig,
} from './callSettingsService';
import {
  isAppRoleAllowedForCalls,
  type CallRuntimeConfig,
} from '../types/callSettings';
import type { CallQualityReport } from './callStatsService';

export type CallType = 'direct' | 'group';
export type CallMediaType = 'audio' | 'video';
export type CallStatus =
  | 'ringing'
  | 'waiting'
  | 'active'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'cancelled'
  | 'failed';
export type CallAccessMode = 'closed' | 'link';
export type CallParticipantRole = 'initiator' | 'participant' | 'moderator';
export type CallParticipantStatus =
  | 'invited'
  | 'ringing'
  | 'joined'
  | 'left'
  | 'declined'
  | 'missed'
  | 'busy';

export type CallRow = {
  id: string;
  type: CallType;
  media_type: CallMediaType;
  status: CallStatus;
  /** null = standalone link meeting (no chat/group) */
  conversation_id: string | null;
  livekit_room_name: string;
  initiated_by: number;
  access_mode: CallAccessMode;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  end_reason: string | null;
  metadata: Record<string, unknown>;
};

export type CallParticipantRow = {
  id: string;
  call_id: string;
  user_id: number;
  role: CallParticipantRole;
  status: CallParticipantStatus;
  invited_at: string;
  joined_at: string | null;
  left_at: string | null;
};

export type CallPublic = {
  id: string;
  type: CallType;
  mediaType: CallMediaType;
  status: CallStatus;
  /** null for standalone Telemost-style meetings without a chat */
  conversationId: string | null;
  /** Пользовательское название встречи (из metadata.title). */
  title?: string | null;
  initiatedBy: number;
  accessMode: CallAccessMode;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endReason: string | null;
  inviteUrl?: string | null;
  participants?: Array<{
    userId: number;
    role: CallParticipantRole;
    status: CallParticipantStatus;
    name?: string;
    avatarUrl?: string | null;
  }>;
};

export class CallsError extends Error {
  constructor(
    public code:
      | 'forbidden'
      | 'not_found'
      | 'busy'
      | 'already_in_call'
      | 'invalid'
      | 'conflict'
      | 'livekit_unavailable'
      | 'invite_invalid'
      | 'invite_expired'
      | 'invite_revoked'
      | 'full'
      | 'disabled',
    message: string,
  ) {
    super(message);
    this.name = 'CallsError';
  }
}

type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

async function requireCallsEnabled(): Promise<CallRuntimeConfig> {
  const cfg = await getCallRuntimeConfig();
  if (!cfg.enabled) throw new CallsError('disabled', 'Звонки отключены');
  return cfg;
}

function ringTimeoutSec(cfg?: CallRuntimeConfig): number {
  return (cfg ?? peekCallRuntimeConfig()).ring_timeout_sec;
}

function inviteTtlHours(cfg?: CallRuntimeConfig): number {
  return (cfg ?? peekCallRuntimeConfig()).invite_ttl_hours;
}

function maxGroupParticipants(cfg?: CallRuntimeConfig): number {
  return (cfg ?? peekCallRuntimeConfig()).max_group_participants;
}

async function loadMemberAppRole(memberId: number): Promise<string | null> {
  const res = await query(
    `SELECT LOWER(TRIM(COALESCE(app_role, ''))) AS r FROM members WHERE id = $1 LIMIT 1`,
    [memberId],
  );
  const r = String(res.rows[0]?.r ?? '').trim();
  return r || null;
}

async function assertCanStartCall(
  initiatorId: number,
  opts: {
    mediaType: CallMediaType;
    kind: 'direct' | 'group' | 'link';
  },
): Promise<CallRuntimeConfig> {
  const cfg = await requireCallsEnabled();
  const role = await loadMemberAppRole(initiatorId);
  if (!isAppRoleAllowedForCalls(role, cfg.allowed_roles)) {
    throw new CallsError('forbidden', 'Вашей роли запрещено начинать звонки');
  }
  if (opts.mediaType === 'audio' && !cfg.features.audio) {
    throw new CallsError('disabled', 'Аудиозвонки отключены администратором');
  }
  if (opts.mediaType === 'video' && !cfg.features.video) {
    throw new CallsError('disabled', 'Видеозвонки отключены администратором');
  }
  if (opts.kind === 'direct' && !cfg.features.direct_calls) {
    throw new CallsError('disabled', 'Личные звонки отключены администратором');
  }
  if (opts.kind === 'group' && !cfg.features.group_calls) {
    throw new CallsError('disabled', 'Групповые звонки отключены администратором');
  }
  if (opts.kind === 'link' && !cfg.features.link_meetings) {
    throw new CallsError('disabled', 'Встречи по ссылке отключены администратором');
  }
  return cfg;
}

function publicWebOrigin(): string {
  const o = String(process.env.PUBLIC_WEB_ORIGIN ?? process.env.VITE_PWA_ORIGIN ?? '').trim();
  return o.replace(/\/$/, '');
}

const MAX_CALL_TITLE_LEN = 80;

export function defaultCallTitle(mediaType: CallMediaType, standalone = false): string {
  if (standalone) return mediaType === 'video' ? 'Видеовстреча' : 'Аудиовстреча';
  return mediaType === 'video' ? 'Видеоконференция' : 'Аудиоконференция';
}

/** Trim + length limit; empty → default label. */
export function normalizeCallTitle(
  raw: unknown,
  mediaType: CallMediaType,
  standalone = false,
): string {
  const t = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!t) return defaultCallTitle(mediaType, standalone);
  return t.slice(0, MAX_CALL_TITLE_LEN);
}

function titleFromCallMetadata(call: Pick<CallRow, 'metadata' | 'media_type' | 'conversation_id'>): string | null {
  const t = call.metadata?.title;
  if (typeof t === 'string' && t.trim()) return t.trim().slice(0, MAX_CALL_TITLE_LEN);
  return null;
}

function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function mapCallRow(row: Record<string, unknown>): CallRow {
  const meta = row.metadata;
  const convRaw = row.conversation_id;
  return {
    id: String(row.id),
    type: row.type as CallType,
    media_type: row.media_type as CallMediaType,
    status: row.status as CallStatus,
    conversation_id: convRaw != null && String(convRaw).trim() !== '' ? String(convRaw) : null,
    livekit_room_name: String(row.livekit_room_name),
    initiated_by: Number(row.initiated_by),
    access_mode: (row.access_mode as CallAccessMode) || 'closed',
    created_at: new Date(String(row.created_at)).toISOString(),
    started_at: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    ended_at: row.ended_at ? new Date(String(row.ended_at)).toISOString() : null,
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    end_reason: row.end_reason != null ? String(row.end_reason) : null,
    metadata:
      meta && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {},
  };
}

function isStandaloneCall(call: Pick<CallRow, 'conversation_id'>): boolean {
  return call.conversation_id == null;
}

async function withTransaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('DATABASE_URL is not defined');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function sendWs(memberId: number, event: WsMessengerEvent): Promise<void> {
  try {
    const { sendToMember } = await import('../realtime/wsHub');
    sendToMember(memberId, event);
  } catch (e) {
    console.warn('[calls] WS send failed:', e instanceof Error ? e.message : e);
  }
}

async function sendWsRoom(
  conversationId: string | null | undefined,
  event: WsMessengerEvent,
): Promise<void> {
  if (conversationId == null || String(conversationId).trim() === '') return;
  try {
    const { sendToRoomAll } = await import('../realtime/wsHub');
    sendToRoomAll(String(conversationId), event);
  } catch (e) {
    console.warn('[calls] WS room send failed:', e instanceof Error ? e.message : e);
  }
}

async function loadMemberProfile(
  memberId: number,
): Promise<{ name: string; avatarUrl: string | null }> {
  try {
    const res = await query(
      `SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), name, 'Участник') AS full_name,
              avatar_url
       FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    const row = res.rows[0] as { full_name?: string; avatar_url?: string | null } | undefined;
    return {
      name: String(row?.full_name ?? `Участник ${memberId}`).trim() || `Участник ${memberId}`,
      avatarUrl: row?.avatar_url != null ? String(row.avatar_url) : null,
    };
  } catch {
    return { name: `Участник ${memberId}`, avatarUrl: null };
  }
}

export async function isMemberBusyInCall(memberId: number, excludeCallId?: string): Promise<boolean> {
  const res = await query(
    `SELECT 1
     FROM call_participants cp
     JOIN calls c ON c.id = cp.call_id
     WHERE cp.user_id = $1
       AND c.status IN ('ringing', 'waiting', 'active')
       AND cp.status IN ('invited', 'ringing', 'joined')
       AND ($2::uuid IS NULL OR c.id <> $2::uuid)
     LIMIT 1`,
    [memberId, excludeCallId ?? null],
  );
  return res.rows.length > 0;
}

/** Serialize create/join per member so concurrent requests cannot double-book a user. */
async function lockMemberCallSlot(client: DbClient, memberId: number): Promise<void> {
  // Namespace key avoids colliding with unrelated advisory locks elsewhere.
  await client.query(`SELECT pg_advisory_xact_lock(87201401, $1::int)`, [memberId]);
}

async function assertMemberFreeInTx(
  client: DbClient,
  memberId: number,
  excludeCallId?: string,
): Promise<void> {
  await lockMemberCallSlot(client, memberId);
  const busy = await client.query(
    `SELECT 1
     FROM call_participants cp
     JOIN calls c ON c.id = cp.call_id
     WHERE cp.user_id = $1
       AND c.status IN ('ringing', 'waiting', 'active')
       AND cp.status IN ('invited', 'ringing', 'joined')
       AND ($2::uuid IS NULL OR c.id <> $2::uuid)
     LIMIT 1`,
    [memberId, excludeCallId ?? null],
  );
  if (busy.rows.length > 0) {
    throw new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
  }
}

async function getParticipantRoleInConversation(
  conversationId: string | null | undefined,
  memberId: number,
): Promise<{ role: string; canManage: boolean } | null> {
  if (conversationId == null || String(conversationId).trim() === '') return null;
  const res = await query(
    `SELECT role, permissions
     FROM conversation_participants
     WHERE conversation_id = $1::bigint AND member_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [conversationId, memberId],
  );
  const row = res.rows[0] as { role?: string; permissions?: unknown } | undefined;
  if (!row) return null;
  const role = String(row.role ?? 'member');
  const perms =
    row.permissions && typeof row.permissions === 'object' && !Array.isArray(row.permissions)
      ? (row.permissions as Record<string, unknown>)
      : {};
  const canManage =
    role === 'owner' || role === 'admin' || perms.can_manage_chat === true;
  return { role, canManage };
}

function toPublicCall(
  call: CallRow,
  extras?: { inviteUrl?: string | null; participants?: CallPublic['participants'] },
): CallPublic {
  return {
    id: call.id,
    type: call.type,
    mediaType: call.media_type,
    status: call.status,
    conversationId: call.conversation_id,
    title: titleFromCallMetadata(call),
    initiatedBy: call.initiated_by,
    accessMode: call.access_mode,
    createdAt: call.created_at,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    durationSeconds: call.duration_seconds,
    endReason: call.end_reason,
    inviteUrl: extras?.inviteUrl ?? null,
    participants: extras?.participants,
  };
}

async function loadCallById(callId: string, client?: DbClient): Promise<CallRow | null> {
  const q = client ?? { query };
  const res = await q.query(`SELECT * FROM calls WHERE id = $1::uuid LIMIT 1`, [callId]);
  const row = res.rows[0];
  return row ? mapCallRow(row) : null;
}

async function assertCanViewCall(call: CallRow, memberId: number): Promise<void> {
  if (!isStandaloneCall(call) && call.conversation_id) {
    const inConv = await isMemberInConversation(call.conversation_id, memberId);
    if (inConv) return;
  }
  const part = await query(
    `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 LIMIT 1`,
    [call.id, memberId],
  );
  if (part.rows.length === 0) {
    throw new CallsError('forbidden', 'Нет доступа к этому звонку');
  }
}

async function insertCallHistoryMessage(input: {
  conversationId: string | null;
  callId: string;
  mediaType: CallMediaType;
  callType: CallType;
  status: CallStatus;
  durationSeconds: number | null;
  initiatedBy: number;
}): Promise<void> {
  if (input.conversationId == null || String(input.conversationId).trim() === '') return;
  const labels: Record<string, string> = {
    ended: input.mediaType === 'video' ? 'Видеозвонок' : 'Аудиозвонок',
    missed: 'Пропущенный вызов',
    declined: 'Вызов отклонён',
    cancelled: 'Вызов отменён',
    failed: 'Вызов не состоялся',
  };
  let content = labels[input.status] ?? (input.mediaType === 'video' ? 'Видеозвонок' : 'Аудиозвонок');
  if (input.status === 'ended' && input.durationSeconds != null && input.durationSeconds > 0) {
    const m = Math.floor(input.durationSeconds / 60);
    const s = input.durationSeconds % 60;
    content = `${content} · ${m}:${String(s).padStart(2, '0')}`;
  } else if (input.status === 'ended') {
    content = 'Вызов завершён';
  }

  const payload = {
    kind: 'call_event',
    call_id: input.callId,
    call_type: input.callType,
    media_type: input.mediaType,
    status: input.status,
    duration_seconds: input.durationSeconds,
    initiated_by: input.initiatedBy,
  };

  try {
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`, [
      input.conversationId,
    ]);
    const contentForDb = encryptMessageText(content);
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload)
       VALUES ($1::bigint, NULL, $2, 'text'::message_payload_type, $3::jsonb)`,
      [input.conversationId, contentForDb, JSON.stringify(payload)],
    );
    await sendWsRoom(input.conversationId, {
      type: 'conv:updated',
      conversationId: input.conversationId,
    });
  } catch (e) {
    console.warn('[calls] history message failed:', e instanceof Error ? e.message : e);
  }
}

async function finalizeCall(
  client: DbClient,
  call: CallRow,
  status: CallStatus,
  endReason: string,
): Promise<CallRow> {
  const startedAt = call.started_at ? new Date(call.started_at).getTime() : null;
  const duration =
    startedAt != null && status === 'ended'
      ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      : null;
  const res = await client.query(
    `UPDATE calls
     SET status = $2,
         ended_at = NOW(),
         duration_seconds = COALESCE($3::int, duration_seconds),
         end_reason = $4
     WHERE id = $1::uuid AND status IN ('ringing', 'waiting', 'active')
     RETURNING *`,
    [call.id, status, duration, endReason],
  );
  const row = res.rows[0];
  if (!row) {
    const current = await loadCallById(call.id, client);
    if (!current) throw new CallsError('not_found', 'Звонок не найден');
    return current;
  }
  return mapCallRow(row);
}

async function createInvitationRaw(
  client: DbClient,
  callId: string,
  createdBy: number,
  maxUses: number | null,
): Promise<{ invitationId: string; rawToken: string; expiresAt: string }> {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashInviteToken(rawToken);
  const hours = inviteTtlHours();
  const res = await client.query(
    `INSERT INTO call_invitations (call_id, token_hash, created_by, expires_at, max_uses)
     VALUES ($1::uuid, $2, $3, NOW() + ($4::int * INTERVAL '1 hour'), $5)
     RETURNING id, expires_at`,
    [callId, tokenHash, createdBy, hours, maxUses],
  );
  const row = res.rows[0];
  return {
    invitationId: String(row.id),
    rawToken,
    expiresAt: new Date(String(row.expires_at)).toISOString(),
  };
}

function inviteUrlFromToken(rawToken: string): string {
  const origin = publicWebOrigin();
  const path = `/call/join/${rawToken}`;
  return origin ? `${origin}${path}` : path;
}

export async function createDirectCall(input: {
  initiatorId: number;
  conversationId: string;
  recipientId: number;
  mediaType: CallMediaType;
}): Promise<CallPublic> {
  const cfg = await assertCanStartCall(input.initiatorId, {
    mediaType: input.mediaType,
    kind: 'direct',
  });
  if (!Number.isFinite(input.recipientId) || input.recipientId === input.initiatorId) {
    throw new CallsError('invalid', 'Некорректный получатель');
  }

  const convType = await getConversationType(input.conversationId);
  if (convType !== 'private') {
    throw new CallsError('forbidden', 'Личный звонок доступен только в личном чате');
  }
  const [okA, okB] = await Promise.all([
    isMemberInConversation(input.conversationId, input.initiatorId),
    isMemberInConversation(input.conversationId, input.recipientId),
  ]);
  if (!okA || !okB) throw new CallsError('forbidden', 'Нет доступа к чату');

  if (await isMemberBusyInCall(input.initiatorId)) {
    throw new CallsError('already_in_call', 'Вы уже участвуете в другом звонке');
  }
  if (await isMemberBusyInCall(input.recipientId)) {
    throw new CallsError('busy', 'Абонент занят');
  }

  const callId = randomUUID();
  const roomName = `direct_${callId.replace(/-/g, '')}`;

  const call = await withTransaction(async (client) => {
    // Lock both members (stable order) to prevent concurrent double-create races.
    const [first, second] =
      input.initiatorId <= input.recipientId
        ? [input.initiatorId, input.recipientId]
        : [input.recipientId, input.initiatorId];
    await lockMemberCallSlot(client, first);
    await lockMemberCallSlot(client, second);

    const busy = await client.query(
      `SELECT cp.user_id
       FROM call_participants cp
       JOIN calls c ON c.id = cp.call_id
       WHERE cp.user_id = ANY($1::int[])
         AND c.status IN ('ringing', 'waiting', 'active')
         AND cp.status IN ('invited', 'ringing', 'joined')
       LIMIT 1`,
      [[input.initiatorId, input.recipientId]],
    );
    if (busy.rows.length > 0) {
      const uid = Number(busy.rows[0].user_id);
      throw new CallsError(
        uid === input.initiatorId ? 'already_in_call' : 'busy',
        uid === input.initiatorId ? 'Вы уже участвуете в другом звонке' : 'Абонент занят',
      );
    }

    const ins = await client.query(
      `INSERT INTO calls (
         id, type, media_type, status, conversation_id, livekit_room_name,
         initiated_by, access_mode, metadata
       ) VALUES (
         $1::uuid, 'direct', $2, 'ringing', $3::bigint, $4, $5, 'closed',
         jsonb_build_object('ring_timeout_sec', $6::int)
       ) RETURNING *`,
      [
        callId,
        input.mediaType,
        input.conversationId,
        roomName,
        input.initiatorId,
        ringTimeoutSec(cfg),
      ],
    );
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status)
       VALUES
         ($1::uuid, $2, 'initiator', 'joined'),
         ($1::uuid, $3, 'participant', 'ringing')`,
      [callId, input.initiatorId, input.recipientId],
    );
    return mapCallRow(ins.rows[0]);
  });

  try {
    await ensureLiveKitRoom({
      roomName,
      // Не рвать комнату при кратком reconnect клиента (иначе DeleteRoom mid-call).
      emptyTimeoutSec: Math.max(900, ringTimeoutSec(cfg) + 600),
      maxParticipants: 2,
      metadata: JSON.stringify({ callId: call.id, type: 'direct' }),
    });
  } catch (e) {
    console.error('[calls] LiveKit room create failed:', e instanceof Error ? e.message : e);
    if (!isLiveKitConfigured()) {
      // Allow ringing UI; token endpoint will fail clearly
    } else {
      await query(
        `UPDATE calls SET status = 'failed', ended_at = NOW(), end_reason = 'livekit_unavailable'
         WHERE id = $1::uuid`,
        [call.id],
      );
      throw new CallsError('livekit_unavailable', 'Сервис звонков временно недоступен');
    }
  }

  const profile = await loadMemberProfile(input.initiatorId);
  const incoming: WsMessengerEvent = {
    type: 'call:incoming',
    callId: call.id,
    callerId: input.initiatorId,
    conversationId: input.conversationId,
    callType: input.mediaType,
    callerName: profile.name,
    callerAvatar: profile.avatarUrl,
  };
  await sendWs(input.recipientId, incoming);

  void sendIncomingCallWake(input.recipientId, {
    callId: call.id,
    conversationId: input.conversationId,
    callType: input.mediaType,
    callerId: input.initiatorId,
    callerName: profile.name,
    callerAvatar: profile.avatarUrl,
    url: `/call/${call.id}`,
    ttlSec: ringTimeoutSec(cfg),
  }).catch((e) => console.warn('[calls] wake failed:', e instanceof Error ? e.message : e));

  return toPublicCall(call);
}

export async function createGroupCall(input: {
  initiatorId: number;
  conversationId: string;
  mediaType: CallMediaType;
  accessMode?: CallAccessMode;
  /** Отображаемое название конференции (шаринг / UI). */
  title?: string | null;
}): Promise<CallPublic> {
  const accessMode: CallAccessMode = input.accessMode === 'link' ? 'link' : 'closed';
  const cfg = await assertCanStartCall(input.initiatorId, {
    mediaType: input.mediaType,
    kind: accessMode === 'link' ? 'link' : 'group',
  });

  const callTitle = normalizeCallTitle(input.title, input.mediaType, false);
  const convType = await getConversationType(input.conversationId);
  // closed — только группа/канал; link (как Телемост/Zoom) — любой чат, включая личный.
  if (accessMode === 'closed' && convType !== 'group' && convType !== 'channel') {
    throw new CallsError('forbidden', 'Групповой звонок доступен только в группе');
  }
  if (
    accessMode === 'link' &&
    convType !== 'group' &&
    convType !== 'channel' &&
    convType !== 'private'
  ) {
    throw new CallsError('forbidden', 'Нет доступа к чату');
  }
  const membership = await getParticipantRoleInConversation(
    input.conversationId,
    input.initiatorId,
  );
  if (!membership) throw new CallsError('forbidden', 'Нет доступа к чату');

  const callId = randomUUID();
  const roomName = `group_${callId.replace(/-/g, '')}`;

  const { call, invite } = await withTransaction(async (client) => {
    await assertMemberFreeInTx(client, input.initiatorId);

    const ins = await client.query(
      `INSERT INTO calls (
         id, type, media_type, status, conversation_id, livekit_room_name,
         initiated_by, access_mode, started_at, metadata
       ) VALUES (
         $1::uuid, 'group', $2, 'waiting', $3::bigint, $4, $5, $6, NOW(),
         $7::jsonb
       ) RETURNING *`,
      [
        callId,
        input.mediaType,
        input.conversationId,
        roomName,
        input.initiatorId,
        accessMode,
        JSON.stringify({ title: callTitle }),
      ],
    );
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
       VALUES ($1::uuid, $2, 'initiator', 'joined', NOW())`,
      [callId, input.initiatorId],
    );
    const inv = await createInvitationRaw(client, callId, input.initiatorId, null);
    return { call: mapCallRow(ins.rows[0]), invite: inv };
  });

  try {
    await ensureLiveKitRoom({
      roomName,
      emptyTimeoutSec: 3600,
      maxParticipants: maxGroupParticipants(cfg),
      metadata: JSON.stringify({ callId: call.id, type: 'group', title: callTitle }),
    });
  } catch (e) {
    console.error('[calls] LiveKit group room failed:', e instanceof Error ? e.message : e);
    if (isLiveKitConfigured()) {
      await query(
        `UPDATE calls SET status = 'failed', ended_at = NOW(), end_reason = 'livekit_unavailable'
         WHERE id = $1::uuid`,
        [call.id],
      );
      throw new CallsError('livekit_unavailable', 'Сервис звонков временно недоступен');
    }
  }

  const inviteUrl = inviteUrlFromToken(invite.rawToken);
  const invitePath = `/call/join/${invite.rawToken}`;
  const meta = await getConversationMeta(input.conversationId);
  const memberIds = await getConversationMemberIds(input.conversationId);
  const initiatorProfile = await loadMemberProfile(input.initiatorId);

  const startedEvt: WsMessengerEvent = {
    type: 'group_call_started',
    callId: call.id,
    conversationId: input.conversationId,
    mediaType: input.mediaType,
    initiatedBy: input.initiatorId,
    initiatorName: initiatorProfile.name,
  };
  for (const mid of memberIds) {
    if (mid === input.initiatorId) continue;
    await sendWs(mid, startedEvt);
    void sendPushNotification(mid, {
      title: callTitle,
      body: `${initiatorProfile.name} · ${meta?.title?.trim() || (convType === 'private' ? 'Чат' : 'Группа')}`,
      type: 'group_call_started',
      callId: call.id,
      conversationId: input.conversationId,
      url: invitePath,
      tag: `group-call-${call.id}`,
    }).catch(() => undefined);
  }

  // Системное сообщение со ссылкой + live fan-out msg:new (чтобы чат обновился сразу).
  try {
    const content = `Создана конференция «${callTitle}»`;
    const contentForDb = encryptMessageText(content);
    const payload = {
      kind: 'call_event',
      call_id: call.id,
      call_type: 'group',
      media_type: input.mediaType,
      status: 'waiting',
      access_mode: accessMode,
      invite_path: invitePath,
      invite_url: inviteUrl,
      title: callTitle,
      initiated_by: input.initiatorId,
    };
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1::bigint`, [
      input.conversationId,
    ]);
    const ins = await query(
      `INSERT INTO messages (conversation_id, sender_id, content, payload_type, payload)
       VALUES ($1::bigint, NULL, $2, 'text'::message_payload_type, $3::jsonb)
       RETURNING id, created_at, updated_at`,
      [input.conversationId, contentForDb, JSON.stringify(payload)],
    );
    const row = ins.rows[0] as { id?: unknown; created_at?: unknown; updated_at?: unknown } | undefined;
    if (row?.id != null) {
      const createdAt = String(row.created_at ?? new Date().toISOString());
      const updatedAt = String(row.updated_at ?? createdAt);
      const message: MessageWithSender = {
        id: String(row.id),
        conversation_id: input.conversationId,
        sender_id: null,
        client_msg_id: null,
        content,
        encrypted_payload: null,
        is_e2ee: false,
        payload_type: 'text',
        payload,
        interaction_count: 0,
        reply_to_message_id: null,
        is_edited: false,
        is_deleted: false,
        is_pinned: false,
        created_at: createdAt,
        updated_at: updatedAt,
        sender_name: null,
        sender_first_name: null,
        sender_last_name: null,
        reply_preview: null,
        reactions: [],
        is_read: false,
      };
      await sendWsRoom(input.conversationId, {
        type: 'msg:new',
        conversationId: input.conversationId,
        message,
      });
    }
    await sendWsRoom(input.conversationId, {
      type: 'conv:updated',
      conversationId: input.conversationId,
    });
  } catch (e) {
    console.warn('[calls] group history message:', e instanceof Error ? e.message : e);
  }

  return toPublicCall(call, { inviteUrl });
}

/**
 * Standalone link meeting (Yandex Telemost style): no chat/group — only LiveKit room + invite URL.
 * After the call ends nothing remains in the messenger.
 */
export async function createStandaloneLinkCall(input: {
  initiatorId: number;
  mediaType: CallMediaType;
  /** Отображаемое название встречи (шаринг / join / UI). */
  title?: string | null;
}): Promise<CallPublic> {
  const cfg = await assertCanStartCall(input.initiatorId, {
    mediaType: input.mediaType,
    kind: 'link',
  });

  const callTitle = normalizeCallTitle(input.title, input.mediaType, true);
  const callId = randomUUID();
  const roomName = `meet_${callId.replace(/-/g, '')}`;

  const { call, invite } = await withTransaction(async (client) => {
    await assertMemberFreeInTx(client, input.initiatorId);

    const ins = await client.query(
      `INSERT INTO calls (
         id, type, media_type, status, conversation_id, livekit_room_name,
         initiated_by, access_mode, started_at, metadata
       ) VALUES (
         $1::uuid, 'group', $2, 'waiting', NULL, $3, $4, 'link', NOW(),
         $5::jsonb
       ) RETURNING *`,
      [
        callId,
        input.mediaType,
        roomName,
        input.initiatorId,
        JSON.stringify({ standalone: true, title: callTitle }),
      ],
    );
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
       VALUES ($1::uuid, $2, 'initiator', 'joined', NOW())`,
      [callId, input.initiatorId],
    );
    const inv = await createInvitationRaw(client, callId, input.initiatorId, null);
    return { call: mapCallRow(ins.rows[0]), invite: inv };
  });

  try {
    await ensureLiveKitRoom({
      roomName,
      emptyTimeoutSec: 3600,
      maxParticipants: maxGroupParticipants(cfg),
      metadata: JSON.stringify({ callId: call.id, type: 'standalone', title: callTitle }),
    });
  } catch (e) {
    console.error('[calls] LiveKit standalone room failed:', e instanceof Error ? e.message : e);
    if (isLiveKitConfigured()) {
      await query(
        `UPDATE calls SET status = 'failed', ended_at = NOW(), end_reason = 'livekit_unavailable'
         WHERE id = $1::uuid`,
        [call.id],
      );
      throw new CallsError('livekit_unavailable', 'Сервис звонков временно недоступен');
    }
  }

  return toPublicCall(call, { inviteUrl: inviteUrlFromToken(invite.rawToken) });
}

export async function getCallForMember(callId: string, memberId: number): Promise<CallPublic> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  await assertCanViewCall(call, memberId);

  const parts = await query(
    `SELECT cp.user_id, cp.role, cp.status,
            COALESCE(NULLIF(TRIM(COALESCE(m.first_name, '') || ' ' || COALESCE(m.last_name, '')), ''), m.name, '') AS name,
            m.avatar_url
     FROM call_participants cp
     JOIN members m ON m.id = cp.user_id
     WHERE cp.call_id = $1::uuid
     ORDER BY cp.created_at ASC`,
    [callId],
  );

  return toPublicCall(call, {
    participants: parts.rows.map((r) => ({
      userId: Number(r.user_id),
      role: r.role as CallParticipantRole,
      status: r.status as CallParticipantStatus,
      name: String(r.name ?? ''),
      avatarUrl: r.avatar_url != null ? String(r.avatar_url) : null,
    })),
  });
}

export async function acceptCall(callId: string, memberId: number): Promise<CallPublic> {
  await requireCallsEnabled();

  const updated = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    const row = locked.rows[0];
    if (!row) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(row);
    if (call.type !== 'direct') {
      throw new CallsError('invalid', 'Принятие доступно только для личного звонка');
    }
    if (call.status !== 'ringing') {
      throw new CallsError('conflict', 'Звонок уже обработан');
    }

    const part = await client.query(
      `SELECT * FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 FOR UPDATE`,
      [callId, memberId],
    );
    if (!part.rows[0]) throw new CallsError('forbidden', 'Вы не участник этого звонка');

    await assertMemberFreeInTx(client, memberId, callId);

    await client.query(
      `UPDATE call_participants
       SET status = 'joined', joined_at = COALESCE(joined_at, NOW())
       WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    const up = await client.query(
      `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
       WHERE id = $1::uuid AND status = 'ringing'
       RETURNING *`,
      [callId],
    );
    if (!up.rows[0]) throw new CallsError('conflict', 'Звонок уже обработан');
    return mapCallRow(up.rows[0]);
  });

  await sendWs(updated.initiated_by, { type: 'call:accepted', callId: updated.id });
  // Снять CallStyle/CallKit на других устройствах принявшего
  void dismissIncomingCallNative(memberId, updated.id).catch(() => undefined);
  return toPublicCall(updated);
}

export async function declineCall(callId: string, memberId: number): Promise<CallPublic> {
  const updated = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);
    if (call.type !== 'direct' || call.status !== 'ringing') {
      throw new CallsError('conflict', 'Звонок нельзя отклонить');
    }
    const part = await client.query(
      `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    if (!part.rows[0] || call.initiated_by === memberId) {
      throw new CallsError('forbidden', 'Нельзя отклонить этот звонок');
    }
    await client.query(
      `UPDATE call_participants SET status = 'declined' WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    return finalizeCall(client, call, 'declined', 'declined');
  });

  await sendWs(updated.initiated_by, {
    type: 'call:rejected',
    callId: updated.id,
    reason: 'declined',
  });
  void dismissIncomingCallNative(memberId, updated.id).catch(() => undefined);
  void sendPushNotification(updated.initiated_by, {
    title: 'Звонок отклонён',
    body: 'Абонент отклонил вызов',
    type: 'call_declined',
    callId: updated.id,
    url: updated.conversation_id
      ? `/messenger?conversationId=${updated.conversation_id}`
      : `/call/${updated.id}`,
    tag: `call-${updated.id}`,
  }).catch(() => undefined);

  await endLiveKitRoom(updated.livekit_room_name);
  await insertCallHistoryMessage({
    conversationId: updated.conversation_id,
    callId: updated.id,
    mediaType: updated.media_type,
    callType: updated.type,
    status: 'declined',
    durationSeconds: null,
    initiatedBy: updated.initiated_by,
  });
  return toPublicCall(updated);
}

export async function cancelCall(callId: string, memberId: number): Promise<CallPublic> {
  const { updated, recipientIds } = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);
    if (call.initiated_by !== memberId) {
      throw new CallsError('forbidden', 'Отменить может только инициатор');
    }
    if (call.status !== 'ringing' && !(call.type === 'group' && call.status === 'waiting')) {
      throw new CallsError('conflict', 'Звонок нельзя отменить');
    }
    const parts = await client.query(
      `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
      [callId, memberId],
    );
    const finalStatus: CallStatus = call.type === 'group' ? 'cancelled' : 'cancelled';
    const done = await finalizeCall(client, call, finalStatus, 'cancelled');
    return {
      updated: done,
      recipientIds: parts.rows.map((r) => Number(r.user_id)),
    };
  });

  for (const rid of recipientIds) {
    await sendWs(rid, { type: 'call:cancelled', callId: updated.id });
    void dismissIncomingCallNative(rid, updated.id).catch(() => undefined);
    void sendPushNotification(rid, {
      title: 'Звонок отменён',
      body: 'Вызов отменён',
      type: 'call_cancelled',
      callId: updated.id,
      url: updated.conversation_id
        ? `/messenger?conversationId=${updated.conversation_id}`
        : `/call/${updated.id}`,
      tag: `call-${updated.id}`,
    }).catch(() => undefined);
  }
  await endLiveKitRoom(updated.livekit_room_name);
  await insertCallHistoryMessage({
    conversationId: updated.conversation_id,
    callId: updated.id,
    mediaType: updated.media_type,
    callType: updated.type,
    status: 'cancelled',
    durationSeconds: null,
    initiatedBy: updated.initiated_by,
  });
  return toPublicCall(updated);
}

export async function endCall(
  callId: string,
  memberId: number,
  opts?: { endForAll?: boolean },
): Promise<CallPublic> {
  const leaveLiveKit: { roomName: string; identity: string }[] = [];
  const endForAll = Boolean(opts?.endForAll);

  const { updated, notifyIds } = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const call = mapCallRow(locked.rows[0]);

    if (!['ringing', 'waiting', 'active'].includes(call.status)) {
      throw new CallsError('conflict', 'Звонок уже завершён');
    }

    const part = await client.query(
      `SELECT role, status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
    const isParticipant = Boolean(part.rows[0]);
    const isModerator =
      call.initiated_by === memberId ||
      part.rows[0]?.role === 'moderator' ||
      part.rows[0]?.role === 'initiator' ||
      Boolean(membership?.canManage);

    if (call.type === 'direct') {
      if (!isParticipant) throw new CallsError('forbidden', 'Нет доступа');
      const done = await finalizeCall(client, call, call.status === 'ringing' ? 'cancelled' : 'ended', 'ended');
      const others = await client.query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
        [callId, memberId],
      );
      return {
        updated: done,
        notifyIds: others.rows.map((r) => Number(r.user_id)),
      };
    }

    // Group: leave vs end conference
    if (!isParticipant && !membership) {
      throw new CallsError('forbidden', 'Нет доступа');
    }

    // Явное «завершить для всех» — только модератор/инициатор.
    // Обычный «Выйти» (в т.ч. хоста) = leave, иначе аудиовстречи рвутся при уходе организатора.
    if (
      endForAll &&
      isModerator &&
      (call.status === 'waiting' || call.status === 'active')
    ) {
      const done = await finalizeCall(client, call, 'ended', 'ended_by_moderator');
      const others = await client.query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid AND user_id <> $2`,
        [callId, memberId],
      );
      return {
        updated: done,
        notifyIds: others.rows.map((r) => Number(r.user_id)),
      };
    }

    // Participant (включая хоста) выходит — LiveKit remove после COMMIT.
    await client.query(
      `UPDATE call_participants
       SET status = 'left', left_at = NOW()
       WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    leaveLiveKit.push({
      roomName: call.livekit_room_name,
      identity: livekitIdentityForMember(memberId),
    });

    const remaining = await client.query(
      `SELECT COUNT(*)::int AS c FROM call_participants
       WHERE call_id = $1::uuid AND status = 'joined'`,
      [callId],
    );
    const count = Number(remaining.rows[0]?.c ?? 0);
    if (count === 0) {
      const done = await finalizeCall(client, call, 'ended', 'all_left');
      return { updated: done, notifyIds: [] as number[] };
    }

    // Promote waiting → active if someone still there
    if (call.status === 'waiting' && count > 0) {
      await client.query(
        `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
         WHERE id = $1::uuid AND status = 'waiting'`,
        [callId],
      );
    }

    const current = await loadCallById(callId, client);
    return { updated: current!, notifyIds: [] as number[] };
  });

  for (const target of leaveLiveKit) {
    try {
      await removeLiveKitParticipant(target.roomName, target.identity);
    } catch {
      /* ignore */
    }
  }

  const duration = updated.duration_seconds ?? undefined;
  for (const nid of notifyIds) {
    await sendWs(nid, {
      type: 'call:ended',
      callId: updated.id,
      reason: updated.end_reason ?? 'ended',
      duration,
    });
  }

  if (['ended', 'cancelled', 'missed', 'declined', 'failed'].includes(updated.status)) {
    await endLiveKitRoom(updated.livekit_room_name);
    if (updated.status === 'ended' || updated.end_reason === 'all_left') {
      await insertCallHistoryMessage({
        conversationId: updated.conversation_id,
        callId: updated.id,
        mediaType: updated.media_type,
        callType: updated.type,
        status: 'ended',
        durationSeconds: updated.duration_seconds,
        initiatedBy: updated.initiated_by,
      });
    }
  } else if (updated.conversation_id) {
    await sendWsRoom(updated.conversation_id, {
      type: 'call:participant_left',
      callId: updated.id,
      userId: memberId,
    });
  }

  return toPublicCall(updated);
}

export async function issueCallToken(
  callId: string,
  memberId: number,
): Promise<{ token: string; url: string; identity: string; call: CallPublic }> {
  const cfg = await requireCallsEnabled();
  if (!isLiveKitConfigured()) {
    throw new CallsError('livekit_unavailable', 'Сервис звонков не настроен');
  }

  let notifyJoinedConversationId: string | null = null;

  const { call, participant } = await withTransaction(async (client) => {
    const locked = await client.query(
      `SELECT * FROM calls WHERE id = $1::uuid FOR UPDATE`,
      [callId],
    );
    if (!locked.rows[0]) throw new CallsError('not_found', 'Звонок не найден');
    const callRow = mapCallRow(locked.rows[0]);

    if (!['ringing', 'waiting', 'active'].includes(callRow.status)) {
      throw new CallsError('conflict', 'Звонок недоступен для подключения');
    }

    const part = await client.query(
      `SELECT role, status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );
    let participantRow = part.rows[0] as { role?: string; status?: string } | undefined;

    // Already on this call → allow token refresh; otherwise enforce single active call.
    if (!participantRow || !['joined', 'ringing', 'invited'].includes(String(participantRow.status))) {
      await assertMemberFreeInTx(client, memberId, callId);
    }

    if (!participantRow) {
      if (callRow.type === 'group' && callRow.access_mode === 'closed' && callRow.conversation_id) {
        const inConv = await isMemberInConversation(callRow.conversation_id, memberId);
        if (!inConv) {
          throw new CallsError('forbidden', 'Нет доступа к конференции');
        }
        const joinedCount = await client.query(
          `SELECT COUNT(*)::int AS c FROM call_participants
           WHERE call_id = $1::uuid AND status = 'joined'`,
          [callId],
        );
        if (Number(joinedCount.rows[0]?.c ?? 0) >= maxGroupParticipants(cfg)) {
          throw new CallsError('full', 'Достигнут лимит участников');
        }
        await client.query(
          `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
           VALUES ($1::uuid, $2, 'participant', 'joined', NOW())
           ON CONFLICT (call_id, user_id) DO UPDATE
             SET status = 'joined',
                 joined_at = COALESCE(call_participants.joined_at, NOW()),
                 left_at = NULL`,
          [callId, memberId],
        );
        if (callRow.status === 'waiting') {
          await client.query(
            `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
             WHERE id = $1::uuid AND status = 'waiting'`,
            [callId],
          );
        }
        participantRow = { role: 'participant', status: 'joined' };
        notifyJoinedConversationId = callRow.conversation_id;
      } else {
        throw new CallsError('forbidden', 'Нет доступа');
      }
    }

    if (callRow.type === 'direct') {
      if (memberId !== callRow.initiated_by && callRow.status === 'ringing') {
        throw new CallsError('conflict', 'Сначала примите звонок');
      }
      if (participantRow.status === 'declined' || participantRow.status === 'missed') {
        throw new CallsError('forbidden', 'Нет доступа к звонку');
      }
    }

    await client.query(
      `UPDATE call_participants
       SET status = 'joined', joined_at = COALESCE(joined_at, NOW()), left_at = NULL
       WHERE call_id = $1::uuid AND user_id = $2`,
      [callId, memberId],
    );

    return { call: callRow, participant: participantRow };
  });

  if (notifyJoinedConversationId) {
    await sendWsRoom(notifyJoinedConversationId, {
      type: 'call:participant_joined',
      callId: call.id,
      userId: memberId,
    });
  }

  const profile = await loadMemberProfile(memberId);
  const isModerator =
    participant.role === 'initiator' ||
    participant.role === 'moderator' ||
    call.initiated_by === memberId;

  await ensureLiveKitRoom({
    roomName: call.livekit_room_name,
    maxParticipants: call.type === 'direct' ? 2 : maxGroupParticipants(cfg),
  });

  const minted = await mintLiveKitJoinToken({
    roomName: call.livekit_room_name,
    identity: livekitIdentityForMember(memberId),
    displayName: profile.name,
    ttlSeconds: cfg.token_ttl_sec,
    avatarUrl: profile.avatarUrl,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: isModerator && call.type === 'group',
  });

  const pub = await getCallForMember(callId, memberId);
  return { ...minted, call: pub };
}

export async function createInvitation(
  callId: string,
  memberId: number,
  options?: { maxUses?: number | null; accessMode?: CallAccessMode },
): Promise<{ invitationId: string; inviteUrl: string; expiresAt: string }> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  if (call.type !== 'group') throw new CallsError('invalid', 'Приглашения только для групп');
  if (!['waiting', 'active'].includes(call.status)) {
    throw new CallsError('conflict', 'Конференция завершена');
  }

  const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
  const part = await query(
    `SELECT role FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
    [callId, memberId],
  );
  const canInvite =
    call.initiated_by === memberId ||
    Boolean(membership?.canManage) ||
    part.rows[0]?.role === 'moderator' ||
    part.rows[0]?.role === 'initiator';
  if (!canInvite) throw new CallsError('forbidden', 'Недостаточно прав для приглашения');

  if (options?.accessMode === 'link' && call.access_mode !== 'link') {
    await query(`UPDATE calls SET access_mode = 'link' WHERE id = $1::uuid`, [callId]);
  }

  const invite = await withTransaction(async (client) =>
    createInvitationRaw(client, callId, memberId, options?.maxUses ?? null),
  );

  return {
    invitationId: invite.invitationId,
    inviteUrl: inviteUrlFromToken(invite.rawToken),
    expiresAt: invite.expiresAt,
  };
}

export async function revokeInvitation(
  callId: string,
  invitationId: string,
  memberId: number,
): Promise<void> {
  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');
  const membership = await getParticipantRoleInConversation(call.conversation_id, memberId);
  const can =
    call.initiated_by === memberId || Boolean(membership?.canManage);
  if (!can) throw new CallsError('forbidden', 'Недостаточно прав');

  const res = await query(
    `UPDATE call_invitations
     SET revoked_at = NOW()
     WHERE id = $1::uuid AND call_id = $2::uuid AND revoked_at IS NULL
     RETURNING id`,
    [invitationId, callId],
  );
  if (!res.rows[0]) throw new CallsError('not_found', 'Приглашение не найдено');
}

export async function getInvitationPreview(rawToken: string, memberId: number | null): Promise<{
  valid: boolean;
  reason?: string;
  mediaType?: CallMediaType;
  callStatus?: CallStatus;
  conversationTitle?: string | null;
  participantCount?: number;
  requiresAuth: boolean;
  canJoin: boolean;
  callId?: string;
}> {
  const tokenHash = hashInviteToken(rawToken);
  const res = await query(
    `SELECT i.id, i.expires_at, i.revoked_at, i.max_uses, i.use_count,
            c.id AS call_id, c.status AS call_status, c.media_type, c.access_mode,
            c.conversation_id, c.type AS call_type, c.metadata AS call_metadata
     FROM call_invitations i
     JOIN calls c ON c.id = i.call_id
     WHERE i.token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  const row = res.rows[0];
  if (!row) {
    return { valid: false, reason: 'not_found', requiresAuth: true, canJoin: false };
  }
  if (row.revoked_at) {
    return { valid: false, reason: 'revoked', requiresAuth: true, canJoin: false };
  }
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    return { valid: false, reason: 'expired', requiresAuth: true, canJoin: false };
  }
  if (row.max_uses != null && Number(row.use_count) >= Number(row.max_uses)) {
    return { valid: false, reason: 'exhausted', requiresAuth: true, canJoin: false };
  }
  if (!['waiting', 'active'].includes(String(row.call_status))) {
    return {
      valid: false,
      reason: 'call_ended',
      callStatus: row.call_status as CallStatus,
      requiresAuth: true,
      canJoin: false,
    };
  }

  const mediaType = row.media_type as CallMediaType;
  const callMeta =
    row.call_metadata && typeof row.call_metadata === 'object' && !Array.isArray(row.call_metadata)
      ? (row.call_metadata as Record<string, unknown>)
      : {};
  const namedTitle =
    typeof callMeta.title === 'string' && callMeta.title.trim()
      ? callMeta.title.trim().slice(0, MAX_CALL_TITLE_LEN)
      : null;

  let conversationTitle: string | null = namedTitle;
  let canJoin = false;
  const convId =
    row.conversation_id != null && String(row.conversation_id).trim() !== ''
      ? String(row.conversation_id)
      : null;
  if (memberId != null) {
    const inConv = convId ? await isMemberInConversation(convId, memberId) : false;
    if (row.access_mode === 'closed' && !inConv) {
      return {
        valid: true,
        reason: 'no_group_access',
        mediaType,
        callStatus: row.call_status as CallStatus,
        conversationTitle: namedTitle,
        requiresAuth: true,
        canJoin: false,
        callId: String(row.call_id),
      };
    }
    canJoin = row.access_mode === 'link' || inConv;
    if (!conversationTitle && inConv && convId) {
      const meta = await getConversationMeta(convId);
      conversationTitle = meta?.title ?? null;
    }
  }
  if (!conversationTitle && !convId && row.access_mode === 'link') {
    conversationTitle = defaultCallTitle(mediaType, true);
  }

  const countRes = await query(
    `SELECT COUNT(*)::int AS c FROM call_participants WHERE call_id = $1::uuid AND status = 'joined'`,
    [row.call_id],
  );

  return {
    valid: true,
    mediaType,
    callStatus: row.call_status as CallStatus,
    conversationTitle,
    participantCount: Number(countRes.rows[0]?.c ?? 0),
    requiresAuth: true,
    canJoin: memberId != null && canJoin,
    callId: String(row.call_id),
  };
}

export async function joinViaInvitation(
  rawToken: string,
  memberId: number,
): Promise<{ token: string; url: string; identity: string; call: CallPublic }> {
  const cfg = await requireCallsEnabled();
  if (!isLiveKitConfigured()) {
    throw new CallsError('livekit_unavailable', 'Сервис звонков не настроен');
  }

  const tokenHash = hashInviteToken(rawToken);

  const callId = await withTransaction(async (client) => {
    const res = await client.query(
      `SELECT i.id AS invitation_id, i.expires_at, i.revoked_at, i.max_uses, i.use_count,
              c.*
       FROM call_invitations i
       JOIN calls c ON c.id = i.call_id
       WHERE i.token_hash = $1
       FOR UPDATE OF i, c`,
      [tokenHash],
    );
    const row = res.rows[0];
    if (!row) throw new CallsError('invite_invalid', 'Приглашение недействительно');
    if (row.revoked_at) throw new CallsError('invite_revoked', 'Приглашение отозвано');
    if (new Date(String(row.expires_at)).getTime() < Date.now()) {
      throw new CallsError('invite_expired', 'Срок приглашения истёк');
    }
    if (row.max_uses != null && Number(row.use_count) >= Number(row.max_uses)) {
      throw new CallsError('invite_invalid', 'Лимит использований исчерпан');
    }
    const call = mapCallRow(row);
    if (!['waiting', 'active'].includes(call.status)) {
      throw new CallsError('conflict', 'Конференция завершена');
    }

    if (call.access_mode === 'closed') {
      if (!call.conversation_id) {
        throw new CallsError('forbidden', 'Нет доступа к группе');
      }
      const inConv = await isMemberInConversation(call.conversation_id, memberId);
      if (!inConv) throw new CallsError('forbidden', 'Нет доступа к группе');
    }

    const existing = await client.query(
      `SELECT status FROM call_participants WHERE call_id = $1::uuid AND user_id = $2`,
      [call.id, memberId],
    );
    const alreadyJoined = existing.rows[0]?.status === 'joined';
    if (!alreadyJoined) {
      await assertMemberFreeInTx(client, memberId, call.id);
    }

    const joinedCount = await client.query(
      `SELECT COUNT(*)::int AS c FROM call_participants
       WHERE call_id = $1::uuid AND status = 'joined'`,
      [call.id],
    );
    if (!alreadyJoined && Number(joinedCount.rows[0]?.c ?? 0) >= maxGroupParticipants(cfg)) {
      throw new CallsError('full', 'Достигнут лимит участников');
    }

    await client.query(
      `INSERT INTO call_participants (call_id, user_id, role, status, joined_at)
       VALUES ($1::uuid, $2, 'participant', 'joined', NOW())
       ON CONFLICT (call_id, user_id) DO UPDATE
         SET status = 'joined',
             joined_at = COALESCE(call_participants.joined_at, NOW()),
             left_at = NULL`,
      [call.id, memberId],
    );

    if (!alreadyJoined) {
      await client.query(
        `UPDATE call_invitations
         SET use_count = use_count + 1
         WHERE id = $1::uuid
           AND revoked_at IS NULL
           AND (max_uses IS NULL OR use_count < max_uses)`,
        [row.invitation_id],
      );
    }

    if (call.status === 'waiting') {
      await client.query(
        `UPDATE calls SET status = 'active', started_at = COALESCE(started_at, NOW())
         WHERE id = $1::uuid AND status = 'waiting'`,
        [call.id],
      );
    }

    return call.id;
  });

  const joinedCall = await loadCallById(callId);
  if (joinedCall?.conversation_id) {
    await sendWsRoom(joinedCall.conversation_id, {
      type: 'call:participant_joined',
      callId,
      userId: memberId,
    });
  }

  return issueCallToken(callId, memberId);
}

export async function listCallHistory(input: {
  memberId: number;
  conversationId?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: CallPublic[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const params: unknown[] = [input.memberId];
  let convFilter = '';
  if (input.conversationId) {
    const ok = await isMemberInConversation(input.conversationId, input.memberId);
    if (!ok) throw new CallsError('forbidden', 'Нет доступа к чату');
    params.push(input.conversationId);
    convFilter = `AND c.conversation_id = $${params.length}::bigint`;
  }
  let cursorFilter = '';
  if (input.cursor) {
    params.push(input.cursor);
    cursorFilter = `AND c.created_at < $${params.length}::timestamptz`;
  }
  params.push(limit + 1);

  const res = await query(
    `SELECT c.*
     FROM calls c
     WHERE EXISTS (
       SELECT 1 FROM conversation_participants cp
       WHERE cp.conversation_id = c.conversation_id
         AND cp.member_id = $1
         AND cp.left_at IS NULL
     )
     ${convFilter}
     ${cursorFilter}
     ORDER BY c.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const rows = res.rows.map((r) => mapCallRow(r));
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((c) => toPublicCall(c));
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt ?? null : null;
  return { items, nextCursor };
}

export type CallQualityReportInput = {
  score: number;
  connectionQuality?: string | null;
  rttMs?: number | null;
  packetLoss?: number | null;
  jitterMs?: number | null;
};

/**
 * Сохраняет отчёт качества от участника в `calls.metadata.quality`.
 * Оценка 0–5 (как LiveKit ConnectionQuality: Lost→0 … Excellent→5).
 */
export async function reportCallQuality(
  callId: string,
  memberId: number,
  input: CallQualityReportInput,
): Promise<{ score: number; reports: CallQualityReport[] }> {
  await requireCallsEnabled();
  const score = Math.max(0, Math.min(5, Number(input.score)));
  if (!Number.isFinite(score)) {
    throw new CallsError('invalid', 'Некорректная оценка качества');
  }

  const part = await query(
    `SELECT 1 FROM call_participants WHERE call_id = $1::uuid AND user_id = $2 LIMIT 1`,
    [callId, memberId],
  );
  if (part.rows.length === 0) {
    throw new CallsError('forbidden', 'Вы не участник этого звонка');
  }

  const call = await loadCallById(callId);
  if (!call) throw new CallsError('not_found', 'Звонок не найден');

  const report: CallQualityReport = {
    userId: memberId,
    score,
    connectionQuality: input.connectionQuality ?? null,
    rttMs: typeof input.rttMs === 'number' && Number.isFinite(input.rttMs) ? input.rttMs : null,
    packetLoss:
      typeof input.packetLoss === 'number' && Number.isFinite(input.packetLoss)
        ? input.packetLoss
        : null,
    jitterMs:
      typeof input.jitterMs === 'number' && Number.isFinite(input.jitterMs) ? input.jitterMs : null,
    at: new Date().toISOString(),
  };

  const prevQuality =
    call.metadata.quality && typeof call.metadata.quality === 'object'
      ? (call.metadata.quality as Record<string, unknown>)
      : {};
  const prevReports = Array.isArray(prevQuality.reports) ? [...prevQuality.reports] : [];
  const filtered = prevReports.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    return Number((r as Record<string, unknown>).userId) !== memberId;
  });
  filtered.push(report);

  const scores = filtered
    .map((r) => (r && typeof r === 'object' ? Number((r as Record<string, unknown>).score) : NaN))
    .filter((n) => Number.isFinite(n));
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : score;

  const nextMeta = {
    ...call.metadata,
    quality: {
      score: Math.round(avg * 10) / 10,
      reports: filtered,
      updated_at: new Date().toISOString(),
    },
  };

  await query(`UPDATE calls SET metadata = $2::jsonb WHERE id = $1::uuid`, [
    callId,
    JSON.stringify(nextMeta),
  ]);

  return {
    score: Math.round(avg * 10) / 10,
    reports: filtered.filter(
      (r): r is CallQualityReport =>
        Boolean(r && typeof r === 'object' && Number.isFinite(Number((r as CallQualityReport).userId))),
    ) as CallQualityReport[],
  };
}

/** Consecutive LiveKit absences before DB marks left (cron tick ≈ 15s). */
const ghostMissStreak = new Map<string, number>();

function ghostMissKey(callId: string, userId: number): string {
  return `${callId}:${userId}`;
}

/**
 * Sync DB «joined» with LiveKit presence so closed tabs don't leave users permanently busy.
 * Grace: ignore recent joins; require several consecutive misses so ICE blips don't kill meetings.
 */
async function reconcileGhostParticipants(): Promise<{ cleared: number; endedEmpty: number }> {
  let cleared = 0;
  let endedEmpty = 0;
  if (!isLiveKitConfigured()) return { cleared, endedEmpty };

  const runtime = peekCallRuntimeConfig();
  const graceSec = runtime.ghost_grace_sec;
  const requiredMisses = runtime.ghost_miss_ticks;

  const active = await query(
    `SELECT c.*
     FROM calls c
     WHERE c.status IN ('waiting', 'active')
       AND EXISTS (
         SELECT 1 FROM call_participants cp
         WHERE cp.call_id = c.id AND cp.status = 'joined'
       )
     ORDER BY c.created_at ASC
     LIMIT 80`,
  );

  const seenKeys = new Set<string>();

  for (const row of active.rows) {
    const call = mapCallRow(row);
    try {
      const identities = await listLiveKitParticipantIdentities(call.livekit_room_name);
      if (identities === null) continue; // Room Service unreachable — skip this tick

      const present = new Set(identities);
      const parts = await query(
        `SELECT user_id, joined_at
         FROM call_participants
         WHERE call_id = $1::uuid AND status = 'joined'`,
        [call.id],
      );

      const ghosts: number[] = [];
      for (const p of parts.rows) {
        const uid = Number(p.user_id);
        const identity = livekitIdentityForMember(uid);
        const key = ghostMissKey(call.id, uid);
        seenKeys.add(key);
        if (present.has(identity)) {
          ghostMissStreak.delete(key);
          continue;
        }
        const joinedAt = p.joined_at ? new Date(String(p.joined_at)).getTime() : 0;
        if (joinedAt && Date.now() - joinedAt < graceSec * 1000) {
          ghostMissStreak.delete(key);
          continue;
        }
        const misses = (ghostMissStreak.get(key) ?? 0) + 1;
        ghostMissStreak.set(key, misses);
        if (misses < requiredMisses) continue;
        ghosts.push(uid);
      }

      if (ghosts.length === 0 && present.size === 0 && parts.rows.length > 0) {
        // Empty LiveKit room: first loop already bumped streaks; promote those at threshold.
        const oldest = Math.min(
          ...parts.rows.map((p) =>
            p.joined_at ? new Date(String(p.joined_at)).getTime() : Date.now(),
          ),
        );
        if (Date.now() - oldest >= graceSec * 1000) {
          for (const p of parts.rows) {
            const uid = Number(p.user_id);
            const key = ghostMissKey(call.id, uid);
            if ((ghostMissStreak.get(key) ?? 0) >= requiredMisses) ghosts.push(uid);
          }
        }
      }

      if (ghosts.length === 0) continue;

      const remaining = await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM calls WHERE id = $1::uuid AND status IN ('waiting', 'active') FOR UPDATE`,
          [call.id],
        );
        if (!locked.rows[0]) return -1;

        await client.query(
          `UPDATE call_participants
           SET status = 'left', left_at = NOW()
           WHERE call_id = $1::uuid
             AND user_id = ANY($2::int[])
             AND status = 'joined'`,
          [call.id, ghosts],
        );
        cleared += ghosts.length;
        for (const uid of ghosts) ghostMissStreak.delete(ghostMissKey(call.id, uid));

        const rem = await client.query(
          `SELECT COUNT(*)::int AS c FROM call_participants
           WHERE call_id = $1::uuid AND status = 'joined'`,
          [call.id],
        );
        const count = Number(rem.rows[0]?.c ?? 0);
        if (count === 0) {
          await finalizeCall(client, mapCallRow(locked.rows[0]), 'ended', 'ghost_cleanup');
          return 0;
        }
        return count;
      });

      // Не шлём call:ended «призракам» — иначе клиент закрывает UI во время LiveKit reconnect.
      // Если комната реально завершена (remaining === 0), уведомим остальных ниже.
      if (remaining === 0) {
        const others = await query(
          `SELECT user_id FROM call_participants WHERE call_id = $1::uuid`,
          [call.id],
        );
        for (const r of others.rows) {
          await sendWs(Number(r.user_id), {
            type: 'call:ended',
            callId: call.id,
            reason: 'ghost_cleanup',
          }).catch(() => undefined);
        }
        await endLiveKitRoom(call.livekit_room_name);
        endedEmpty += 1;
      }
    } catch (e) {
      console.warn('[calls] ghost reconcile:', e instanceof Error ? e.message : e);
    }
  }

  // Drop stale streak keys for calls no longer active in this pass
  for (const key of ghostMissStreak.keys()) {
    if (!seenKeys.has(key)) ghostMissStreak.delete(key);
  }

  return { cleared, endedEmpty };
}

/** Cron: ringing past timeout → missed; ghost joined → left; empty rooms → ended */
export async function cleanupStaleCalls(): Promise<{
  missed: number;
  endedEmpty: number;
  ghostsCleared: number;
}> {
  const timeout = ringTimeoutSec();
  const ringing = await query(
    `SELECT * FROM calls
     WHERE status = 'ringing'
       AND created_at < NOW() - ($1::int * INTERVAL '1 second')
     LIMIT 100`,
    [timeout],
  );

  let missed = 0;
  for (const row of ringing.rows) {
    const call = mapCallRow(row);
    try {
      const done = await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM calls WHERE id = $1::uuid AND status = 'ringing' FOR UPDATE`,
          [call.id],
        );
        if (!locked.rows[0]) return null;
        await client.query(
          `UPDATE call_participants SET status = 'missed'
           WHERE call_id = $1::uuid AND status = 'ringing'`,
          [call.id],
        );
        return finalizeCall(client, mapCallRow(locked.rows[0]), 'missed', 'no_answer');
      });
      if (!done) continue;
      missed += 1;
      await endLiveKitRoom(done.livekit_room_name);
      const parts = await query(
        `SELECT user_id FROM call_participants WHERE call_id = $1::uuid`,
        [done.id],
      );
      for (const p of parts.rows) {
        await sendWs(Number(p.user_id), {
          type: 'call:ended',
          callId: done.id,
          reason: 'no_answer',
        });
      }
      // Missed push to callee
      const callee = parts.rows.find((p) => Number(p.user_id) !== done.initiated_by);
      if (callee) {
        void dismissIncomingCallNative(Number(callee.user_id), done.id).catch(() => undefined);
        void sendPushNotification(Number(callee.user_id), {
          title: 'Пропущенный вызов',
          body: done.media_type === 'video' ? 'Видеозвонок' : 'Аудиозвонок',
          type: 'missed_call',
          callId: done.id,
          conversationId: done.conversation_id ?? undefined,
          url: done.conversation_id
            ? `/messenger?conversationId=${done.conversation_id}`
            : `/call/${done.id}`,
          tag: `call-${done.id}`,
        }).catch(() => undefined);
      }
      await insertCallHistoryMessage({
        conversationId: done.conversation_id,
        callId: done.id,
        mediaType: done.media_type,
        callType: done.type,
        status: 'missed',
        durationSeconds: null,
        initiatedBy: done.initiated_by,
      });
    } catch (e) {
      console.warn('[calls] miss cleanup:', e instanceof Error ? e.message : e);
    }
  }

  const ghosts = await reconcileGhostParticipants();

  // Empty group calls waiting too long with no joined (fallback if LiveKit unreachable)
  const empty = await query(
    `SELECT c.*
     FROM calls c
     WHERE c.type = 'group'
       AND c.status IN ('waiting', 'active')
       AND c.created_at < NOW() - INTERVAL '2 hours'
       AND NOT EXISTS (
         SELECT 1 FROM call_participants cp
         WHERE cp.call_id = c.id AND cp.status = 'joined'
       )
     LIMIT 50`,
  );
  let endedEmpty = ghosts.endedEmpty;
  for (const row of empty.rows) {
    const call = mapCallRow(row);
    try {
      await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM calls WHERE id = $1::uuid AND status IN ('waiting', 'active') FOR UPDATE`,
          [call.id],
        );
        if (!locked.rows[0]) return;
        await finalizeCall(client, mapCallRow(locked.rows[0]), 'ended', 'expired_empty');
      });
      await endLiveKitRoom(call.livekit_room_name);
      endedEmpty += 1;
    } catch {
      /* ignore */
    }
  }

  // Direct calls stuck in active with no joined (ghost hangup)
  const stuckDirect = await query(
    `SELECT c.*
     FROM calls c
     WHERE c.type = 'direct'
       AND c.status IN ('waiting', 'active')
       AND c.started_at IS NOT NULL
       AND c.started_at < NOW() - INTERVAL '30 minutes'
       AND NOT EXISTS (
         SELECT 1 FROM call_participants cp
         WHERE cp.call_id = c.id AND cp.status = 'joined'
       )
     LIMIT 30`,
  );
  for (const row of stuckDirect.rows) {
    const call = mapCallRow(row);
    try {
      await withTransaction(async (client) => {
        const locked = await client.query(
          `SELECT * FROM calls WHERE id = $1::uuid AND status IN ('waiting', 'active') FOR UPDATE`,
          [call.id],
        );
        if (!locked.rows[0]) return;
        await finalizeCall(client, mapCallRow(locked.rows[0]), 'ended', 'stale_direct');
      });
      await endLiveKitRoom(call.livekit_room_name);
      endedEmpty += 1;
    } catch {
      /* ignore */
    }
  }

  // Revoke/cleanup old invitations (mark expired visually by leaving rows; optional delete)
  await query(
    `UPDATE call_invitations
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE revoked_at IS NULL AND expires_at < NOW() - INTERVAL '7 days'`,
  ).catch(() => undefined);

  return { missed, endedEmpty, ghostsCleared: ghosts.cleared };
}
