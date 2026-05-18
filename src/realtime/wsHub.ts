import type { IncomingMessage, Server } from 'node:http';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { WebSocketServer, WebSocket } from 'ws';

import { readAuthTokenFromCookies } from '../config/authCookie';
import { resolveSessionByToken, type SessionPrincipal } from '../services/authService';
import { isMemberInConversation, verifyMessageSenderInConversation } from '../services/messengerService';
import { memberCanJoinServicePlanPresenceSession } from '../services/servicePlannerService';
import type { WsMessengerEvent } from '../types/messenger';
import { handleCallClientMessage, handleCallMemberOffline, initCallSignaling } from './callSignaling';

// ─── Redis pub/sub (ioredis, горизонтальное масштабирование, без Socket.io) ──
// Проект использует пакет `ws`, а не socket.io — @socket.io/redis-adapter сюда не подключается.

const FANOUT_CHANNEL = 'realtime:fanout';
/** Адресная доставка пользователю (все инстансы подписаны; origin отсекает эхо на том же процессе). */
const CHAT_EVENTS_CHANNEL = 'chat:events';
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

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
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
  | { kind: 'presence'; event: WsMessengerEvent }
  | { kind: 'broadcast'; payload: unknown }
  | { kind: 'ensureRoom'; memberId: number; conversationId: string };

type FanoutEnvelope = { origin: string; payload: FanoutPayload };

function isRedisPubReady(): boolean {
  return pubClient != null && pubClient.status === 'ready';
}

function publishFanout(payload: FanoutPayload): void {
  if (!redisFanoutEnabled || !isRedisPubReady() || !pubClient) return;
  const envelope: FanoutEnvelope = { origin: INSTANCE_ID, payload };
  void pubClient
    .publish(FANOUT_CHANNEL, JSON.stringify(envelope))
    .catch((err) => console.error('[realtime] Redis publish failed:', err));
}

/**
 * Публикация события одному пользователю на все инстансы API.
 * На удалённых процессах подписчик шлёт только локальным сокетам этого userId.
 */
export function publishChatUserEvent(userId: number, message: string): void {
  if (!redisFanoutEnabled || !isRedisPubReady() || !pubClient) return;
  const body = JSON.stringify({ userId, message, origin: INSTANCE_ID });
  void pubClient
    .publish(CHAT_EVENTS_CHANNEL, body)
    .catch((err) => console.error('[realtime] Redis chat:events publish failed:', err));
}

// ─── Client tracking ─────────────────────────────────────────

interface AuthenticatedClient {
  ws: WebSocket;
  memberId: number;
  memberName: string;
  /** Conversation IDs this client has joined */
  rooms: Set<string>;
  lastPongAtMs: number;
}

/** All authenticated clients indexed by WebSocket instance */
const clientsByWs = new Map<WebSocket, AuthenticatedClient>();
/** memberId → Set of clients (one user can have multiple tabs/devices) */
const clientsByMember = new Map<number, Set<AuthenticatedClient>>();
/** conversationId → Set of clients in the room */
const rooms = new Map<string, Set<AuthenticatedClient>>();
/** Online member IDs (at least one connected client) */
const onlineMembers = new Set<number>();
/**
 * Нативный WebSocket ping (ответ — pong от клиента).
 *
 * 25 секунд — компромисс между:
 *   - типичным nginx/Cloudflare `proxy_read_timeout` (60 с) — ниже него нужно успеть;
 *   - клиентским pong-deadline 35 с (`realtimeWsClient.ts`) — сервер должен быть
 *     не агрессивнее клиента, иначе на 2G/3G возникает «реконнект-шторм»:
 *     RTT + потеря пакета легко превышает 15 с, и прежнее значение рвало
 *     соединения, которые клиент всё ещё считал живыми.
 */
const HEARTBEAT_INTERVAL_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const HEARTBEAT_STALE_AFTER_MS = HEARTBEAT_INTERVAL_MS + PONG_TIMEOUT_MS;
const MAX_WS_MESSAGE_BYTES = 64 * 1024;

type AuthFailRecord = { count: number; windowStartedAt: number; until: number };
const AUTH_SPAM_WINDOW_MS = 60_000;
const AUTH_SPAM_BLOCK_MS = 60_000;
const AUTH_SPAM_LIMIT = 5;
const authFailMap = new Map<string, AuthFailRecord>();
const UNSTABLE_CLOSE_WINDOW_MS = 60_000;
const UNSTABLE_CLOSE_THRESHOLD = 5;
const abnormalCloseByMember = new Map<number, number[]>();
/** Время последнего аномального (1006) разрыва — для ограничения повторных рукопожатий после «unstable». */
const lastAbnormalDisconnectAtByMember = new Map<number, number>();
const RECONNECT_COOLDOWN_AFTER_UNSTABLE_MS = 30_000;

function getClientIp(req: IncomingMessage): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0]?.trim() || 'unknown';
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function isAuthSpam(ip: string): boolean {
  const now = Date.now();
  const rec = authFailMap.get(ip);
  return Boolean(rec && now < rec.until);
}

function recordAuthFail(ip: string): void {
  const now = Date.now();
  const rec = authFailMap.get(ip) ?? { count: 0, windowStartedAt: now, until: 0 };
  if (now - rec.windowStartedAt > AUTH_SPAM_WINDOW_MS) {
    rec.count = 0;
    rec.windowStartedAt = now;
    rec.until = 0;
  }
  rec.count += 1;
  if (rec.count >= AUTH_SPAM_LIMIT) {
    rec.until = now + AUTH_SPAM_BLOCK_MS;
    rec.count = 0;
    rec.windowStartedAt = now;
    console.warn(`[realtime] auth spam block: ${ip} for 60s`);
  }
  authFailMap.set(ip, rec);
}

function clearAuthFail(ip: string): void {
  authFailMap.delete(ip);
}

function recordAbnormalClose(memberId: number): void {
  const now = Date.now();
  lastAbnormalDisconnectAtByMember.set(memberId, now);
  const windowStart = now - UNSTABLE_CLOSE_WINDOW_MS;
  const prev = abnormalCloseByMember.get(memberId) ?? [];
  const next = prev.filter((ts) => ts >= windowStart);
  next.push(now);
  abnormalCloseByMember.set(memberId, next);
  if (next.length > UNSTABLE_CLOSE_THRESHOLD) {
    console.warn('[realtime] unstable connection', {
      memberId,
      disconnects: next.length,
      windowMs: UNSTABLE_CLOSE_WINDOW_MS,
      code: 1006,
    });
  }
}

/** Больше порога разрывов 1006 за окно — новое подключение в течение cooldown отклоняем. */
function isMemberUnstableForCooldown(memberId: number): boolean {
  const now = Date.now();
  const windowStart = now - UNSTABLE_CLOSE_WINDOW_MS;
  const prev = abnormalCloseByMember.get(memberId) ?? [];
  const recent = prev.filter((ts) => ts >= windowStart).length;
  return recent > UNSTABLE_CLOSE_THRESHOLD;
}

const authFailCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of authFailMap) {
    if (now > rec.until + AUTH_SPAM_WINDOW_MS) {
      authFailMap.delete(ip);
    }
  }
}, 5 * 60_000);
authFailCleanupTimer.unref?.();

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
    const now = Date.now();
    for (const [, client] of clientsByWs) {
      if (now - client.lastPongAtMs > HEARTBEAT_STALE_AFTER_MS) {
        console.warn('[realtime] heartbeat: нет pong, разрываю сокет', { memberId: client.memberId });
        removeClient(client.ws);
        try {
          client.ws.terminate();
        } catch {
          /* ignore */
        }
        continue;
      }
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

    // Некоторые прокси добавляют завершающий `/` или префикс — приводим к каноническому пути.
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    if (pathname !== '/api/realtime') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      void handleNewSocket(ws, getClientIp(request), request);
    });
  });
}

const AUTH_TIMEOUT_MS = 12_000;

async function handleNewSocket(ws: WebSocket, ip: string, request: IncomingMessage): Promise<void> {
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

  const timer = setTimeout(() => {
    recordAuthFail(ip);
    fail(1008, 'auth timeout');
  }, AUTH_TIMEOUT_MS);

  if (isAuthSpam(ip)) {
    clearTimeout(timer);
    fail(1008, 'auth spam blocked');
    return;
  }

  ws.once('message', async (raw) => {
    if (closed) return;
    try {
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      const msg = JSON.parse(text) as { type?: string; token?: string };
      if (msg.type !== 'auth' || typeof msg.token !== 'string' || !msg.token.trim()) {
        clearTimeout(timer);
        recordAuthFail(ip);
        fail(1008, 'invalid auth');
        return;
      }
      const rawToken = msg.token.trim();
      const cookieToken = readAuthTokenFromCookies({ headers: { cookie: request.headers.cookie } });
      const candidateTokens: string[] = [];
      if (rawToken && rawToken !== '__cookie_session__') {
        candidateTokens.push(rawToken);
      }
      if (cookieToken && !candidateTokens.includes(cookieToken)) {
        candidateTokens.push(cookieToken);
      }
      if (candidateTokens.length === 0) {
        clearTimeout(timer);
        recordAuthFail(ip);
        fail(1008, 'invalid auth');
        return;
      }
      let sessionOk: SessionPrincipal | null = null;
      for (const token of candidateTokens) {
        // Browser can authenticate WS either by explicit Bearer-like token or HttpOnly cookie session.
        const resolution = await resolveSessionByToken(token);
        if (resolution.principal) {
          sessionOk = resolution.principal;
          break;
        }
      }
      if (!sessionOk) {
        clearTimeout(timer);
        recordAuthFail(ip);
        console.warn('[realtime] auth rejected (invalid or expired token)');
        fail(1008, 'unauthorized');
        return;
      }
      clearAuthFail(ip);
      clearTimeout(timer);
      if (closed) return;

      const nowTs = Date.now();
      const lastAbnormal = lastAbnormalDisconnectAtByMember.get(sessionOk.userId);
      if (
        isMemberUnstableForCooldown(sessionOk.userId) &&
        typeof lastAbnormal === 'number' &&
        nowTs - lastAbnormal < RECONNECT_COOLDOWN_AFTER_UNSTABLE_MS
      ) {
        console.warn('[realtime] reconnect cooldown (unstable client)', {
          memberId: sessionOk.userId,
          waitMs: RECONNECT_COOLDOWN_AFTER_UNSTABLE_MS - (nowTs - lastAbnormal),
        });
        fail(1008, 'too many reconnects, please wait');
        return;
      }

      // Build the authenticated client
      const client: AuthenticatedClient = {
        ws,
        memberId: sessionOk.userId,
        memberName: '',
        rooms: new Set(),
        lastPongAtMs: Date.now(),
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
        client.lastPongAtMs = Date.now();
      });

      ws.on('close', (code, reason) => {
        if (code !== 1000 && code !== 1001) {
          const reasonStr = Buffer.isBuffer(reason) ? reason.toString('utf8') : String(reason);
          const payload = {
            memberId: client.memberId,
            code,
            reason: reasonStr.slice(0, 120),
          };
          if (code === 1006) {
            console.warn('[realtime] client close (abnormal)', payload);
            recordAbnormalClose(client.memberId);
          } else {
            console.info('[realtime] client close', payload);
          }
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

type ClientInboundMessage = {
  type?: unknown;
  conversationId?: unknown;
  planId?: unknown;
  messageId?: unknown;
  clientMsgId?: unknown;
  senderId?: unknown;
};

async function handleClientMessage(client: AuthenticatedClient, msg: ClientInboundMessage): Promise<void> {
  if (typeof msg.type === 'string' && msg.type.startsWith('call:')) {
    await handleCallClientMessage(
      { ws: client.ws, memberId: client.memberId, memberName: client.memberName },
      msg,
    );
    return;
  }

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
    case 'service_plan:join': {
      const planId = typeof msg.planId === 'number' ? msg.planId : Number(msg.planId);
      if (!Number.isInteger(planId) || planId <= 0) break;
      try {
        const allowed = await memberCanJoinServicePlanPresenceSession(planId, client.memberId);
        if (!allowed) break;
        const roomId = servicePlanPresenceRoomId(planId);
        joinRoom(client, roomId);
        broadcastServicePlanRoomPresence(roomId);
      } catch {
        /* ignore */
      }
      break;
    }
    case 'service_plan:leave': {
      const planId = typeof msg.planId === 'number' ? msg.planId : Number(msg.planId);
      if (!Number.isInteger(planId) || planId <= 0) break;
      const roomId = servicePlanPresenceRoomId(planId);
      if (client.rooms.has(roomId)) {
        leaveRoom(client, roomId);
        broadcastServicePlanRoomPresence(roomId);
      }
      break;
    }
    case 'msg:delivered_signal': {
      const convId =
        typeof msg.conversationId === 'string' && msg.conversationId.trim()
          ? String(msg.conversationId).trim()
          : '';
      const messageId =
        typeof msg.messageId === 'string' && msg.messageId.trim() ? String(msg.messageId).trim() : '';
      const clientMsgId =
        typeof msg.clientMsgId === 'string' && msg.clientMsgId.trim()
          ? String(msg.clientMsgId).trim().slice(0, 160)
          : '';
      const senderRaw = msg.senderId;
      const senderId = typeof senderRaw === 'number' ? senderRaw : Number(senderRaw);
      if (!convId || !messageId || !clientMsgId || !Number.isFinite(senderId)) break;
      if (senderId === client.memberId) break;
      try {
        const recipientOk = await isMemberInConversation(convId, client.memberId);
        if (!recipientOk) break;
        const senderOk = await isMemberInConversation(convId, senderId);
        if (!senderOk) break;
        if (/^\d+$/.test(messageId)) {
          const verified = await verifyMessageSenderInConversation(convId, messageId, senderId);
          if (!verified) break;
        }
        sendToMember(senderId, {
          type: 'msg:delivered',
          conversationId: convId,
          messageId,
          clientMsgId,
          deliveredByMemberId: client.memberId,
        });
      } catch {
        /* ignore */
      }
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

function servicePlanPresenceRoomId(planId: number): string {
  return `sp:${planId}`;
}

function collectServicePlanPeers(roomId: string): Array<{ memberId: number; memberName: string }> {
  const room = rooms.get(roomId);
  if (!room) return [];
  const byId = new Map<number, string>();
  for (const c of room) {
    if (!byId.has(c.memberId)) {
      byId.set(c.memberId, (c.memberName || '').trim() || `User ${c.memberId}`);
    }
  }
  return Array.from(byId.entries()).map(([memberId, memberName]) => ({ memberId, memberName }));
}

function broadcastServicePlanRoomPresence(roomId: string): void {
  if (!roomId.startsWith('sp:')) return;
  const planId = Number(roomId.slice(3));
  if (!Number.isInteger(planId) || planId <= 0) return;
  const room = rooms.get(roomId);
  if (!room || room.size === 0) return;
  const peers = collectServicePlanPeers(roomId);
  const event: WsMessengerEvent = { type: 'service_plan:presence', servicePlanId: planId, peers };
  sendToRoomAll(roomId, event);
}

function removeClient(ws: WebSocket): void {
  const client = clientsByWs.get(ws);
  if (!client) {
    return;
  }

  const servicePlanRoomsToRefresh = new Set<string>();
  for (const roomId of client.rooms) {
    if (roomId.startsWith('sp:')) {
      servicePlanRoomsToRefresh.add(roomId);
    }
  }

  // Leave all rooms
  for (const roomId of client.rooms) {
    const room = rooms.get(roomId);
    if (room) {
      room.delete(client);
      if (room.size === 0) rooms.delete(roomId);
    }
  }

  for (const roomId of servicePlanRoomsToRefresh) {
    broadcastServicePlanRoomPresence(roomId);
  }

  // Remove from member index
  const memberClients = clientsByMember.get(client.memberId);
  if (memberClients) {
    memberClients.delete(client);
    if (memberClients.size === 0) {
      handleCallMemberOffline(client.memberId);
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

function createRedisClient(role: 'pub' | 'sub', redisUrl: string): Redis {
  return new Redis(redisUrl, {
    connectionName: `realtime-ws-${role}`,
    maxRetriesPerRequest: null,
    lazyConnect: true,
    retryStrategy(retries: number): number | null {
      if (retries > 6) return null;
      return Math.min(retries * 400, 2500);
    },
  });
}

function handleChatEventsMessage(raw: string): void {
  let parsed: { userId?: unknown; message?: unknown; origin?: unknown };
  try {
    parsed = JSON.parse(raw) as { userId?: unknown; message?: unknown; origin?: unknown };
  } catch {
    return;
  }
  if (typeof parsed.origin === 'string' && parsed.origin === INSTANCE_ID) {
    return;
  }
  const userId = typeof parsed.userId === 'number' ? parsed.userId : Number(parsed.userId);
  if (!Number.isFinite(userId)) return;
  if (typeof parsed.message !== 'string') return;
  const memberClients = clientsByMember.get(userId);
  if (!memberClients) return;
  for (const client of memberClients) {
    safeSend(client.ws, parsed.message);
  }
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

  const redisUrl = rewriteLocalRedisUrlIfInsideDocker(resolveRedisUrl());
  if (process.env.REDIS_REALTIME_ENABLED === 'true' && !(process.env.REDIS_URL?.trim())) {
    console.warn(
      '[realtime] REDIS_REALTIME_ENABLED=true, но REDIS_URL пуст — подключаемся к redis://127.0.0.1:6379.',
    );
  }

  const pub = createRedisClient('pub', redisUrl);
  pub.on('error', makeThrottledRedisErrorLog('pub'));

  try {
    await pub.connect();
    pubClient = pub;
    redisFanoutEnabled = true;
    console.log(
      `[realtime] Redis publisher OK (ioredis) → ${FANOUT_CHANNEL}, ${CHAT_EVENTS_CHANNEL} (${redisUrl}) instance=${INSTANCE_ID.slice(0, 8)}…`,
    );
  } catch (e) {
    console.error('[realtime] Redis publisher connect failed:', e);
    redisFanoutEnabled = false;
    pub.removeAllListeners('error');
    pub.disconnect();
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

  const redisUrl = rewriteLocalRedisUrlIfInsideDocker(resolveRedisUrl());
  if (process.env.REDIS_REALTIME_ENABLED === 'true' && !(process.env.REDIS_URL?.trim())) {
    console.warn(
      '[realtime] REDIS_REALTIME_ENABLED=true, но REDIS_URL пуст — подключаемся к redis://127.0.0.1:6379. ' +
        'Если Redis в Docker на другом порту, задайте, например: REDIS_URL=redis://127.0.0.1:6380',
    );
  }

  if (pubClient) {
    pubClient.removeAllListeners('error');
    pubClient.disconnect();
    pubClient = null;
  }
  if (subClient) {
    subClient.removeAllListeners('error');
    subClient.removeAllListeners('message');
    subClient.disconnect();
    subClient = null;
  }

  const pub = createRedisClient('pub', redisUrl);
  const sub = createRedisClient('sub', redisUrl);
  pub.on('error', makeThrottledRedisErrorLog('pub'));
  sub.on('error', makeThrottledRedisErrorLog('sub'));

  try {
    await pub.connect();
    await sub.connect();
    await sub.subscribe(FANOUT_CHANNEL, CHAT_EVENTS_CHANNEL);
    sub.on('message', (channel: string, message: string) => {
      if (channel === FANOUT_CHANNEL) {
        handleRemoteFanout(message);
      } else if (channel === CHAT_EVENTS_CHANNEL) {
        handleChatEventsMessage(message);
      }
    });
    pubClient = pub;
    subClient = sub;
    redisFanoutEnabled = true;
    console.log(
      `[realtime] Redis pub/sub OK (ioredis) → ${FANOUT_CHANNEL}, ${CHAT_EVENTS_CHANNEL} (${redisUrl}) instance=${INSTANCE_ID.slice(0, 8)}…`,
    );
  } catch (e) {
    console.error('[realtime] Redis connect/subscribe failed — fan-out local-only:', e);
    redisFanoutEnabled = false;
    pub.removeAllListeners('error');
    sub.removeAllListeners('error');
    sub.removeAllListeners('message');
    sub.disconnect();
    pub.disconnect();
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
  publishChatUserEvent(memberId, JSON.stringify(event));
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

initCallSignaling({
  sendToMember,
  isMemberOnline,
});
