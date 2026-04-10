import type { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { createClient, type RedisClientType } from 'redis';
import { WebSocketServer, WebSocket } from 'ws';

import { resolveSessionByToken } from '../services/authService';
import { getRealtimeInstanceId, publishFanoutBroadcastPayload } from './wsHub';

// ─── Redis (второй subscriber на тот же канал, что и wsHub в другом процессе) ──

const FANOUT_CHANNEL = 'realtime:fanout';

function shouldConnectRedisFanout(): boolean {
  if (process.env.REDIS_REALTIME_ENABLED === 'false') return false;
  if (process.env.REDIS_REALTIME_ENABLED === 'true') return true;
  const url = process.env.REDIS_URL;
  return typeof url === 'string' && url.trim() !== '';
}

function resolveRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || 'redis://127.0.0.1:6379';
}

function rewriteLocalRedisUrlIfInsideDocker(url: string): string {
  if (!existsSync('/.dockerenv')) {
    return url;
  }
  try {
    const u = new URL(url);
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
      return url;
    }
    u.hostname = 'host.docker.internal';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

function makeThrottledRedisErrorLog(role: 'sub'): (err: unknown) => void {
  let lastLogMs = 0;
  const intervalMs = 20_000;
  return (err: unknown) => {
    const now = Date.now();
    if (now - lastLogMs < intervalMs) return;
    lastLogMs = now;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[realtime-notify][redis ${role}] ${msg}`);
  };
}

type FanoutEnvelope = { origin: string; payload: { kind: string; payload?: unknown } };

let notifySubClient: RedisClientType | null = null;

const notifySockets = new Set<WebSocket>();

function safeSend(ws: WebSocket, data: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(data);
    } catch {
      /* ignore */
    }
  }
}

function deliverLocalNotify(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const ws of notifySockets) {
    safeSend(ws, data);
  }
}

function handleRemoteFanoutNotify(raw: string): void {
  let parsed: FanoutEnvelope;
  try {
    parsed = JSON.parse(raw) as FanoutEnvelope;
  } catch {
    return;
  }
  if (!parsed || typeof parsed.origin !== 'string' || parsed.origin === getRealtimeInstanceId()) {
    return;
  }
  const p = parsed.payload;
  if (p.kind === 'broadcast' && 'payload' in p) {
    deliverLocalNotify(p.payload);
  }
}

/**
 * Инвалидация React Query + fan-out на другие инстансы основного API.
 */
export function broadcastRealtime(payload: unknown): void {
  deliverLocalNotify(payload);
  publishFanoutBroadcastPayload(payload);
}

const AUTH_TIMEOUT_MS = 12_000;

export function attachNotifyWebSocket(server: Server): void {
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
      void handleNotifySocket(ws);
    });
  });
}

async function handleNotifySocket(ws: WebSocket): Promise<void> {
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

      notifySockets.add(ws);

      try {
        ws.send(
          JSON.stringify({
            type: 'ready',
            v: 1,
            memberId: sessionOk.userId,
            onlineMembers: [],
          }),
        );
      } catch {
        notifySockets.delete(ws);
        fail(1011, 'send failed');
        return;
      }

      ws.on('message', (data) => {
        try {
          const text2 = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
          const inner = JSON.parse(text2) as { type?: string };
          if (inner.type === 'ping') {
            safeSend(ws, JSON.stringify({ type: 'pong' }));
          }
        } catch {
          /* ignore */
        }
      });

      const cleanup = () => {
        notifySockets.delete(ws);
      };
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    } catch {
      clearTimeout(timer);
      fail(1011, 'server error');
    }
  });
}

/**
 * Подписка на fan-out: удалённые broadcast → локальные notify-клиенты.
 */
export async function initNotifyRealtimeRedis(): Promise<void> {
  if (process.env.REDIS_REALTIME_ENABLED === 'false') {
    console.log('[realtime-notify] Redis subscriber skipped (REDIS_REALTIME_ENABLED=false)');
    return;
  }
  if (!shouldConnectRedisFanout()) {
    console.log('[realtime-notify] Redis subscriber skipped (нет REDIS_URL)');
    return;
  }

  const redisUrl = rewriteLocalRedisUrlIfInsideDocker(resolveRedisUrl());
  const sub = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy(retries: number): false | number {
        if (retries > 6) return false;
        return Math.min(retries * 400, 2500);
      },
    },
  });
  sub.on('error', makeThrottledRedisErrorLog('sub'));

  try {
    await sub.connect();
    await sub.subscribe(FANOUT_CHANNEL, (message) => {
      handleRemoteFanoutNotify(message);
    });
    notifySubClient = sub as RedisClientType;
    console.log(`[realtime-notify] Redis subscriber OK → ${FANOUT_CHANNEL}`);
  } catch (e) {
    console.error('[realtime-notify] Redis subscriber failed:', e);
    sub.removeAllListeners('error');
    await sub.disconnect().catch(() => {});
    notifySubClient = null;
  }
}
