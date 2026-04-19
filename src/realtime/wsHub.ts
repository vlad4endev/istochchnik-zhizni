import type { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient, type RedisClientType } from 'redis';
import { WebSocketServer, WebSocket } from 'ws';

import { resolveSessionByToken } from '../services/authService';
import { isMemberInConversation } from '../services/messengerService';
import type { WsMessengerEvent } from '../types/messenger';

// ─── Redis pub/sub (горизонтальное масштабирование, без Socket.io) ──
// Проект использует пакет `ws`, а не socket.io — @socket.io/redis-adapter сюда не подключается.

const FANOUT_CHANNEL = 'realtime:fanout';
const INSTANCE_ID = randomUUID();

/** Один origin для всех publishFanout в процессе (подписчики игнорируют свои же сообщения). */
export function getRealtimeInstanceId(): string {
  return INSTANCE_ID;
}

/** Fan-out через Redis только если явно включили (иначе каждый старт бил бы 127.0.0.1:6379 и забивал лог). */
function shouldConnectRedisFanout(): boolean {
  if (process.env.REDIS_REALTIME_ENABLED === 'false') return false;
  if (process.env.REDIS_REALTIME_ENABLED === 'true') return true;
  const url = process.env.REDIS_URL;
  return typeof url === 'string' && url.trim() !== '';
}

function resolveRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
}

/**
 * В Docker `127.0.0.1` / `localhost` — это контейнер API, а не хост с `docker run -p 6380:6379`.
 * Подменяем на host.docker.internal (в compose нужен extra_hosts: host.docker.internal:host-gateway).
 */
function rewriteLocalRedisUrlIfInsideDocker(url: string): string {
  if (!existsSync('/.dockerenv')) {
    return url;
  }
  try {
    const u = new URL(url);
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      return url;
    }
    const prev = url.trim();
    u.hostname = 'host.docker.internal';
    const next = u.toString().replace(/\/$/, '');
    if (next !== prev) {
      console.warn(
        `[realtime] Docker: REDIS_URL был «${prev}» (из контейнера это не хост). Подключаюсь к «${next}». ` +
          'В docker-compose у сервиса api должно быть: extra_hosts: ["host.docker.internal:host-gateway"].',
      );
    }
    return next;
  } catch {
    return url;
  }
}

let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let redisFanoutEnabled = false;

function makeThrottledRedisErrorLog(role: 'pub' | 'sub'): (err: unknown) => void {
  let lastLogMs = 0;
  const intervalMs = 20_000;
  return (err: unknown) => {
    const now = Date.now();
    if (now - lastLogMs < intervalMs) return;
    lastLogMs = now;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[realtime][redis ${role}] ${msg} (повторы не чаще раз в ${intervalMs / 1000} с). ` +
        'Нет Redis — уберите REDIS_URL или задайте REDIS_REALTIME_ENABLED=false. В Docker укажите хост сервиса, не 127.0.0.1.',
    );
  };
}

type FanoutPayload =
  | { kind: 'room'; conversationId: string; event: WsMessengerEvent; excludeMemberId?: number }
  | { kind: 'roomAll'; conversationId: string; event: WsMessengerEvent }
  | { kind: 'member'; memberId: number; event: WsMessengerEvent }
  | { kind: 'presence'; event: WsMessengerEvent }
  | { kind: 'broadcast'; payload: unknown }
  | { kind: 'ensureRoom'; memberId: number; conversationId: string };

type FanoutEnvelope = { origin: string; payload: FanoutPayload };

function publishFanout(payload: FanoutPayload): void {
  if (!redisFanoutEnabled || !pubClient?.isOpen) return;
  const envelope: FanoutEnvelope = { origin: INSTANCE_ID, payload };
  void pubClient
    .publish(FANOUT_CHANNEL, JSON.stringify(envelope))
    .catch((err) => console.error('[realtime] Redis publish failed:', err));
}

// ─── Client tracking ─────────────────────────────────────────

interface AuthenticatedClient {
  ws: WebSocket;
  memberId: number;
  memberName: string;
  /** Conversation IDs this client has joined */
  rooms: Set<string>;
  isAlive: boolean;
}

/** All authenticated clients indexed by WebSocket instance */
const clientsByWs = new Map<WebSocket, AuthenticatedClient>();
/** memberId → Set of clients (one user can have multiple tabs/devices) */
const clientsByMember = new Map<number, Set<AuthenticatedClient>>();
/** conversationId → Set of clients in the room */
const rooms = new Map<string, Set<AuthenticatedClient>>();
/** Online member IDs (at least one connected client) */
const onlineMembers = new Set<number>();
/** Нативный WebSocket ping (ответ — pong от клиента). Держим ниже типичного proxy_read_timeout (60s). */
const HEARTBEAT_INTERVAL_MS = 15_000;
const MAX_WS_MESSAGE_BYTES = 64 * 1024;

let safeSendFailLogLastMs = 0;
function logSafeSendFailureThrottled(err: unknown): void {
  const now = Date.now();
  if (now - safeSendFailLogLastMs < 5000) return;
  safeSendFailLogLastMs = now;
  const msg = err instanceof Error ? err.message : String(err);
  console.warn('[realtime] ws.send failed (throttled):', msg);
}

// ─── Attach ───────────────────────────────────────────────────

export function attachRealtimeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatTimer = setInterval(() => {
    for (const [, client] of clientsByWs) {
      if (!client.isAlive) {
        console.warn('[realtime] heartbeat: нет pong, разрываю сокет', { memberId: client.memberId });
        removeClient(client.ws);
        try {
          client.ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
      client.isAlive = false;
      try {
        client.ws.ping();
      } catch (e) {
        console.warn('[realtime] heartbeat: ping() failed', {
          memberId: client.memberId,
          err: e instanceof Error ? e.message : String(e),
        });
        removeClient(client.ws);
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  server.on('upgrade', (request, socket, head) => {
    let pathname = '/';
    try {
      const host = request.headers.host ?? 'localhost';
      pathname = new URL(request.url ?? '/', `http://${host}`).pathname;
    } catch {
      socket.destroy();
      return;
    }

    if (pathname !== '/api/realtime') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      void handleNewSocket(ws);
    });
  });
}

const AUTH_TIMEOUT_MS = 12_000;

async function handleNewSocket(ws: WebSocket): Promise<void> {
  let closed = false;

  const fail = (code: number, reason: string) => {
    if (closed) return;
    closed = true;
    try {
      ws.close(code, reason);
    } catch {
      /* ignore */
    }
  };

  const timer = setTimeout(() => fail(1008, 'auth timeout'), AUTH_TIMEOUT_MS);

  ws.once('message', async (raw) => {
    if (closed) return;
    try {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      const msg = JSON.parse(text) as { type?: string; token?: string };
      if (msg.type !== 'auth' || typeof msg.token !== 'string' || !msg.token.trim()) {
        clearTimeout(timer);
        fail(1008, 'invalid auth');
        return;
      }
      const sessionOk = await resolveSessionByToken(msg.token.trim());
      if (!sessionOk) {
        clearTimeout(timer);
        console.warn('[realtime] auth rejected (invalid or expired token)');
        fail(1008, 'unauthorized');
        return;
      }
      clearTimeout(timer);
      if (closed) return;

      // Build the authenticated client
      const client: AuthenticatedClient = {
        ws,
        memberId: sessionOk.userId,
        memberName: '',
        rooms: new Set(),
        isAlive: true,
      };

      // Try to fetch member name
      try {
        const { query } = await import('../config/db');
        const nameRes = await query(
          `SELECT COALESCE(first_name, '') || ' ' || COALESCE(last_name, '') AS full_name FROM members WHERE id = $1 LIMIT 1`,
          [sessionOk.userId],
        );
        client.memberName = nameRes.rows[0]?.full_name?.trim() || `User ${sessionOk.userId}`;
      } catch {
        client.memberName = `User ${sessionOk.userId}`;
      }

      clientsByWs.set(ws, client);

      // Track by member
      if (!clientsByMember.has(client.memberId)) {
        clientsByMember.set(client.memberId, new Set());
      }
      clientsByMember.get(client.memberId)!.add(client);

      // Online presence
      const wasOnline = onlineMembers.has(client.memberId);
      onlineMembers.add(client.memberId);
      if (!wasOnline) {
        broadcastPresence({ type: 'presence:online', memberId: client.memberId });
      }

      // Auto-join all conversation rooms
      try {
        const { query } = await import('../config/db');
        const convRes = await query(
          `SELECT conversation_id FROM conversation_participants WHERE member_id = $1 AND left_at IS NULL`,
          [client.memberId],
        );
        for (const row of convRes.rows) {
          const roomId = String(row.conversation_id);
          joinRoom(client, roomId);
        }
      } catch {
        /* conversations not yet created — ok */
      }

      try {
        ws.send(JSON.stringify({
          type: 'ready',
          v: 1,
          memberId: client.memberId,
          onlineMembers: Array.from(onlineMembers),
        }));
      } catch {
        removeClient(ws);
        fail(1011, 'send failed');
        return;
      }

      // Handle subsequent messages (messenger events)
      ws.on('message', (data) => {
        try {
          if (Buffer.isBuffer(data) && data.byteLength > MAX_WS_MESSAGE_BYTES) {
            fail(1009, 'message too large');
            return;
          }
          const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          if (text.length > MAX_WS_MESSAGE_BYTES) {
            fail(1009, 'message too large');
            return;
          }
          const msg = JSON.parse(text);
          void handleClientMessage(client, msg);
        } catch {
          /* malformed message — ignore */
        }
      });
      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('close', (code, reason) => {
        if (code !== 1000 && code !== 1001) {
          const reasonStr = Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason);
          console.info('[realtime] client close', {
            memberId: client.memberId,
            code,
            reason: reasonStr.slice(0, 120),
          });
        }
        removeClient(ws);
      });
      ws.on('error', (err) => {
        console.warn('[realtime] client socket error', {
          memberId: client.memberId,
          message: err instanceof Error ? err.message : String(err),
        });
        removeClient(ws);
      });
    } catch {
      clearTimeout(timer);
      fail(1011, 'server error');
    }
  });
}

// ─── Client message handling ──────────────────────────────────

async function handleClientMessage(client: AuthenticatedClient, msg: any): Promise<void> {
  switch (msg.type) {
    case 'join': {
      // Join a conversation room: { type: 'join', conversationId }
      if (typeof msg.conversationId === 'string') {
        const convId = String(msg.conversationId).trim();
        if (!convId) break;
        try {
          const allowed = await isMemberInConversation(convId, client.memberId);
          if (!allowed) {
            try {
              client.ws.close(1008, 'forbidden conversation');
            } catch {
              /* ignore */
            }
            removeClient(client.ws);
            break;
          }
          joinRoom(client, convId);
        } catch {
          /* ignore membership check errors */
        }
      }
      break;
    }
    case 'leave': {
      // Leave a conversation room: { type: 'leave', conversationId }
      if (typeof msg.conversationId === 'string') {
        leaveRoom(client, msg.conversationId);
      }
      break;
    }
    case 'typing:start': {
      // { type: 'typing:start', conversationId }
      if (typeof msg.conversationId === 'string') {
        if (!client.rooms.has(msg.conversationId)) break;
        sendToRoom(msg.conversationId, {
          type: 'typing:start',
          conversationId: msg.conversationId,
          memberId: client.memberId,
          memberName: client.memberName,
        }, client.memberId);
      }
      break;
    }
    case 'typing:stop': {
      // { type: 'typing:stop', conversationId }
      if (typeof msg.conversationId === 'string') {
        if (!client.rooms.has(msg.conversationId)) break;
        sendToRoom(msg.conversationId, {
          type: 'typing:stop',
          conversationId: msg.conversationId,
          memberId: client.memberId,
        }, client.memberId);
      }
      break;
    }
    case 'ping': {
      safeSend(client.ws, JSON.stringify({ type: 'pong', t: Date.now() }));
      break;
    }
    default: {
      if (msg?.type != null && process.env.NODE_ENV !== 'production') {
        console.info('[realtime] unknown client message type:', String(msg.type));
      }
      break;
    }
  }
}

// ─── Room management ──────────────────────────────────────────

function joinRoom(client: AuthenticatedClient, roomId: string): void {
  client.rooms.add(roomId);
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(client);
}

function leaveRoom(client: AuthenticatedClient, roomId: string): void {
  client.rooms.delete(roomId);
  const room = rooms.get(roomId);
  if (room) {
    room.delete(client);
    if (room.size === 0) rooms.delete(roomId);
  }
}

function removeClient(ws: WebSocket): void {
  const client = clientsByWs.get(ws);
  if (!client) {
    return;
  }

  // Leave all rooms
  for (const roomId of client.rooms) {
    const room = rooms.get(roomId);
    if (room) {
      room.delete(client);
      if (room.size === 0) rooms.delete(roomId);
    }
  }

  // Remove from member index
  const memberClients = clientsByMember.get(client.memberId);
  if (memberClients) {
    memberClients.delete(client);
    if (memberClients.size === 0) {
      clientsByMember.delete(client.memberId);
      onlineMembers.delete(client.memberId);
      persistLastSeenAndBroadcastOffline(client.memberId);
    }
  }

  clientsByWs.delete(ws);
}

// ─── Local delivery (этот процесс) + Redis fan-out ─────────────

function safeSend(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(data);
    } catch (e) {
      logSafeSendFailureThrottled(e);
    }
  }
}

function deliverToLocalRoom(
  conversationId: string,
  event: WsMessengerEvent,
  excludeMemberId?: number,
): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const client of room) {
    if (excludeMemberId !== undefined && client.memberId === excludeMemberId) continue;
    safeSend(client.ws, data);
  }
}

function deliverToLocalRoomAll(conversationId: string, event: WsMessengerEvent): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const client of room) {
    safeSend(client.ws, data);
  }
}

function deliverToLocalMember(memberId: number, event: WsMessengerEvent): void {
  const memberClients = clientsByMember.get(memberId);
  if (!memberClients) return;
  const data = JSON.stringify(event);
  for (const client of memberClients) {
    safeSend(client.ws, data);
  }
}

function deliverLocalPresence(event: WsMessengerEvent): void {
  const data = JSON.stringify(event);
  for (const [, client] of clientsByWs) {
    safeSend(client.ws, data);
  }
}

function deliverLocalBroadcast(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const [, client] of clientsByWs) {
    safeSend(client.ws, data);
  }
}

function ensureMemberInRoomLocal(memberId: number, conversationId: string): void {
  const memberClients = clientsByMember.get(memberId);
  if (!memberClients) return;
  for (const client of memberClients) {
    joinRoom(client, conversationId);
  }
}

function handleRemoteFanout(raw: string): void {
  let parsed: FanoutEnvelope;
  try {
    parsed = JSON.parse(raw) as FanoutEnvelope;
  } catch {
    return;
  }
  if (!parsed || typeof parsed.origin !== 'string' || parsed.origin === INSTANCE_ID) {
    return;
  }
  const p = parsed.payload;
  switch (p.kind) {
    case 'room':
      deliverToLocalRoom(p.conversationId, p.event, p.excludeMemberId);
      break;
    case 'roomAll':
      deliverToLocalRoomAll(p.conversationId, p.event);
      break;
    case 'member':
      deliverToLocalMember(p.memberId, p.event);
      break;
    case 'presence':
      deliverLocalPresence(p.event);
      break;
    case 'broadcast':
      deliverLocalBroadcast(p.payload);
      break;
    case 'ensureRoom':
      ensureMemberInRoomLocal(p.memberId, p.conversationId);
      break;
    default:
      break;
  }
}

function buildRedisSocketOpts(): { reconnectStrategy(retries: number): false | number } {
  return {
    reconnectStrategy(retries: number): false | number {
      if (retries > 6) return false;
      return Math.min(retries * 400, 2500);
    },
  };
}

/**
 * Только Redis publisher: для процесса основного API, чтобы sendToRoom* доходили до сервиса мессенджера
 * через fan-out (локальных WS-клиентов чата в этом процессе нет).
 */
export async function initMessengerFanoutPublisherOnly(): Promise<void> {
  if (process.env.REDIS_REALTIME_ENABLED === 'false') {
    console.log('[realtime] Redis publisher skipped (REDIS_REALTIME_ENABLED=false)');
    return;
  }
  if (!shouldConnectRedisFanout()) {
    console.log(
      '[realtime] Redis publisher skipped (нет REDIS_URL / fan-out выключен) — push в чат из этого процесса без Redis не синхронизируется с messenger.',
    );
    return;
  }

  let redisUrl = rewriteLocalRedisUrlIfInsideDocker(resolveRedisUrl());
  if (process.env.REDIS_REALTIME_ENABLED === 'true' && !(process.env.REDIS_URL?.trim())) {
    console.warn(
      '[realtime] REDIS_REALTIME_ENABLED=true, но REDIS_URL пуст — подключаемся к redis://127.0.0.1:6379.',
    );
  }

  const pub = createClient({ url: redisUrl, socket: buildRedisSocketOpts() });
  pub.on('error', makeThrottledRedisErrorLog('pub'));

  try {
    await pub.connect();
    pubClient = pub as RedisClientType;
    redisFanoutEnabled = true;
    console.log(
      `[realtime] Redis publisher OK (fan-out → messenger) → ${FANOUT_CHANNEL} (${redisUrl}) instance=${INSTANCE_ID.slice(0, 8)}…`,
    );
  } catch (e) {
    console.error('[realtime] Redis publisher connect failed:', e);
    redisFanoutEnabled = false;
    pub.removeAllListeners('error');
    await pub.disconnect().catch(() => {});
    pubClient = null;
  }
}

/**
 * Подключение Redis pub/sub до приёма WebSocket upgrade.
 * При сбое — только лог; realtime остаётся в рамках одного процесса.
 */
export async function initRealtimeRedis(): Promise<void> {
  if (process.env.REDIS_REALTIME_ENABLED === 'false') {
    console.log('[realtime] Redis fan-out disabled (REDIS_REALTIME_ENABLED=false)');
    return;
  }

  if (!shouldConnectRedisFanout()) {
    console.log(
      '[realtime] Redis fan-out skipped (задайте REDIS_REALTIME_ENABLED=true или non-empty REDIS_URL). In-process only.',
    );
    return;
  }

  let redisUrl = rewriteLocalRedisUrlIfInsideDocker(resolveRedisUrl());
  if (process.env.REDIS_REALTIME_ENABLED === 'true' && !(process.env.REDIS_URL?.trim())) {
    console.warn(
      '[realtime] REDIS_REALTIME_ENABLED=true, но REDIS_URL пуст — подключаемся к redis://127.0.0.1:6379. ' +
        'Если Redis в Docker на другом порту, задайте, например: REDIS_URL=redis://127.0.0.1:6380',
    );
  }

  const socketOpts = buildRedisSocketOpts();

  const pub = createClient({ url: redisUrl, socket: socketOpts });
  const sub = createClient({ url: redisUrl, socket: socketOpts });
  pub.on('error', makeThrottledRedisErrorLog('pub'));
  sub.on('error', makeThrottledRedisErrorLog('sub'));

  try {
    await pub.connect();
    await sub.connect();
    await sub.subscribe(FANOUT_CHANNEL, (message) => {
      handleRemoteFanout(message);
    });
    pubClient = pub as RedisClientType;
    subClient = sub as RedisClientType;
    redisFanoutEnabled = true;
    console.log(
      `[realtime] Redis pub/sub OK → ${FANOUT_CHANNEL} (${redisUrl}) instance=${INSTANCE_ID.slice(0, 8)}…`,
    );
  } catch (e) {
    console.error('[realtime] Redis connect/subscribe failed — fan-out local-only:', e);
    redisFanoutEnabled = false;
    pub.removeAllListeners('error');
    sub.removeAllListeners('error');
    await sub.disconnect().catch(() => {});
    await pub.disconnect().catch(() => {});
    pubClient = null;
    subClient = null;
  }
}

// ─── Public API for sending events ────────────────────────────

/**
 * Send a messenger event to all clients in a conversation room.
 * Optionally exclude a specific member (e.g., the sender).
 */
export function sendToRoom(
  conversationId: string,
  event: WsMessengerEvent,
  excludeMemberId?: number,
): void {
  deliverToLocalRoom(conversationId, event, excludeMemberId);
  publishFanout({ kind: 'room', conversationId, event, excludeMemberId });
}

/**
 * Send an event to room INCLUDING the sender (for syncing across devices).
 */
export function sendToRoomAll(conversationId: string, event: WsMessengerEvent): void {
  deliverToLocalRoomAll(conversationId, event);
  publishFanout({ kind: 'roomAll', conversationId, event });
}

/**
 * Send an event to a specific member (all their connected clients).
 */
export function sendToMember(memberId: number, event: WsMessengerEvent): void {
  deliverToLocalMember(memberId, event);
  publishFanout({ kind: 'member', memberId, event });
}

/**
 * Ensure a member is joined to a conversation room (called after creating a new conversation).
 */
export function ensureMemberInRoom(memberId: number, conversationId: string): void {
  ensureMemberInRoomLocal(memberId, conversationId);
  publishFanout({ kind: 'ensureRoom', memberId, conversationId });
}

/**
 * Check if a member is currently online.
 */
export function isMemberOnline(memberId: number): boolean {
  return onlineMembers.has(memberId);
}

/**
 * Get all online member IDs.
 */
export function getOnlineMemberIds(): number[] {
  return Array.from(onlineMembers);
}

/**
 * Только fan-out «broadcast» (инвалидация React Query — см. `wsNotifyHub.broadcastRealtime`).
 */
export function publishFanoutBroadcastPayload(payload: unknown): void {
  publishFanout({ kind: 'broadcast', payload });
}

/**
 * Инвалидация React Query + fan-out на другие инстансы основного API.
 * Аналог функции из старого wsNotifyHub.ts.
 */
export function broadcastRealtime(payload: unknown): void {
  deliverLocalBroadcast(payload);
  publishFanoutBroadcastPayload(payload);
}

// ─── Internal helpers ─────────────────────────────────────────

function broadcastPresence(event: WsMessengerEvent): void {
  deliverLocalPresence(event);
  publishFanout({ kind: 'presence', event });
}

/** Последнее отключение всех вкладок: пишем last_seen_at и шлём клиентам ISO-время. */
function persistLastSeenAndBroadcastOffline(memberId: number): void {
  void (async () => {
    let lastSeenAt: string | undefined;
    try {
      const { query } = await import('../config/db');
      const res = await query(
        `UPDATE members SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING last_seen_at`,
        [memberId],
      );
      const raw = res.rows[0]?.last_seen_at as string | Date | undefined;
      if (raw != null) {
        lastSeenAt = raw instanceof Date ? raw.toISOString() : new Date(raw).toISOString();
      }
    } catch {
      /* колонка может отсутствовать на старых БД */
    }
    const event: WsMessengerEvent = lastSeenAt
      ? { type: 'presence:offline', memberId, lastSeenAt }
      : { type: 'presence:offline', memberId };
    broadcastPresence(event);
  })();
}
