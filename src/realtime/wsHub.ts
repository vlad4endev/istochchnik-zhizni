import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import { resolveSessionByToken } from '../services/authService';
import type { WsMessengerEvent } from '../types/messenger';

// ─── Client tracking ─────────────────────────────────────────

interface AuthenticatedClient {
  ws: WebSocket;
  memberId: number;
  memberName: string;
  /** Conversation IDs this client has joined */
  rooms: Set<string>;
}

/** All authenticated clients indexed by WebSocket instance */
const clientsByWs = new Map<WebSocket, AuthenticatedClient>();
/** memberId → Set of clients (one user can have multiple tabs/devices) */
const clientsByMember = new Map<number, Set<AuthenticatedClient>>();
/** conversationId → Set of clients in the room */
const rooms = new Map<string, Set<AuthenticatedClient>>();
/** Online member IDs (at least one connected client) */
const onlineMembers = new Set<number>();

// ─── Attach ───────────────────────────────────────────────────

export function attachRealtimeWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

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
          const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          const msg = JSON.parse(text);
          handleClientMessage(client, msg);
        } catch {
          /* malformed message — ignore */
        }
      });

      ws.on('close', () => removeClient(ws));
      ws.on('error', () => removeClient(ws));
    } catch {
      clearTimeout(timer);
      fail(1011, 'server error');
    }
  });
}

// ─── Client message handling ──────────────────────────────────

function handleClientMessage(client: AuthenticatedClient, msg: any): void {
  switch (msg.type) {
    case 'join': {
      // Join a conversation room: { type: 'join', conversationId }
      if (typeof msg.conversationId === 'string') {
        joinRoom(client, msg.conversationId);
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
        sendToRoom(msg.conversationId, {
          type: 'typing:stop',
          conversationId: msg.conversationId,
          memberId: client.memberId,
        }, client.memberId);
      }
      break;
    }
    case 'ping': {
      safeSend(client.ws, JSON.stringify({ type: 'pong' }));
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
  const room = rooms.get(conversationId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const client of room) {
    if (excludeMemberId !== undefined && client.memberId === excludeMemberId) continue;
    safeSend(client.ws, data);
  }
}

/**
 * Send an event to room INCLUDING the sender (for syncing across devices).
 */
export function sendToRoomAll(conversationId: string, event: WsMessengerEvent): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const data = JSON.stringify(event);
  for (const client of room) {
    safeSend(client.ws, data);
  }
}

/**
 * Send an event to a specific member (all their connected clients).
 */
export function sendToMember(memberId: number, event: WsMessengerEvent): void {
  const memberClients = clientsByMember.get(memberId);
  if (!memberClients) return;
  const data = JSON.stringify(event);
  for (const client of memberClients) {
    safeSend(client.ws, data);
  }
}

/**
 * Ensure a member is joined to a conversation room (called after creating a new conversation).
 */
export function ensureMemberInRoom(memberId: number, conversationId: string): void {
  const memberClients = clientsByMember.get(memberId);
  if (!memberClients) return;
  for (const client of memberClients) {
    joinRoom(client, conversationId);
  }
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
 * Broadcast any generic invalidation payload (legacy API — used by other parts of the app).
 */
export function broadcastRealtime(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const [, client] of clientsByWs) {
    safeSend(client.ws, data);
  }
}

// ─── Internal helpers ─────────────────────────────────────────

function broadcastPresence(event: WsMessengerEvent): void {
  const data = JSON.stringify(event);
  for (const [, client] of clientsByWs) {
    safeSend(client.ws, data);
  }
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

function safeSend(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(data);
    } catch {
      /* ignore send failures */
    }
  }
}
