import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

import { resolveSessionByToken } from '../services/authService';

const clients = new Set<WebSocket>();

/**
 * Трансляция в памяти процесса Node. При нескольких репликах API каждая держит своих клиентов —
 * для кластера понадобился бы общий брокер (Redis и т.п.).
 */
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

      clients.add(ws);
      try {
        ws.send(JSON.stringify({ type: 'ready', v: 1 }));
      } catch {
        clients.delete(ws);
        fail(1011, 'send failed');
        return;
      }

      ws.on('close', () => {
        clients.delete(ws);
      });
      ws.on('error', () => {
        clients.delete(ws);
      });
    } catch {
      clearTimeout(timer);
      fail(1011, 'server error');
    }
  });
}

export function broadcastRealtime(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}
