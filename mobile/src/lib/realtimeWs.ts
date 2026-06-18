import { resolveRealtimeWebSocketUrl } from './config';

type WsHandler = (msg: Record<string, unknown>) => void;

let ws: WebSocket | null = null;
let authToken: string | null = null;
let stopped = true;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectAttempts = 0;
let activeConversationId: string | null = null;

const handlers = new Set<WsHandler>();
const BASE_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 30_000;

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

export function sendRealtimeJson(payload: Record<string, unknown>): void {
  sendJson(payload);
}

function sendJson(payload: Record<string, unknown>): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function scheduleReconnect(): void {
  if (stopped || !authToken) return;
  clearReconnectTimer();
  const delay = Math.min(BASE_RECONNECT_MS * 2 ** reconnectAttempts, MAX_RECONNECT_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    openSocket();
  }, delay);
}

function onOpen(): void {
  reconnectAttempts = 0;
  if (!authToken) return;
  sendJson({ type: 'auth', token: authToken });
}

function onMessage(event: WebSocketMessageEvent): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(event.data));
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== 'object') return;
  const msg = parsed as Record<string, unknown>;

  if (msg.type === 'ready' && activeConversationId) {
    sendJson({ type: 'join', conversationId: activeConversationId });
  }

  for (const handler of handlers) {
    try {
      handler(msg);
    } catch {
      /* ignore */
    }
  }
}

function onClose(): void {
  ws = null;
  if (!stopped && authToken) {
    scheduleReconnect();
  }
}

function openSocket(): void {
  if (stopped || !authToken) return;
  const url = resolveRealtimeWebSocketUrl();
  if (!url) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    ws = new WebSocket(url);
    ws.onopen = onOpen;
    ws.onmessage = onMessage;
    ws.onclose = onClose;
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    scheduleReconnect();
  }
}

export function connectRealtimeWs(token: string): void {
  authToken = token;
  stopped = false;
  reconnectAttempts = 0;
  clearReconnectTimer();
  openSocket();
}

export function disconnectRealtimeWs(): void {
  stopped = true;
  authToken = null;
  activeConversationId = null;
  clearReconnectTimer();
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
}

export function subscribeRealtimeWs(handler: WsHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function setActiveMessengerConversation(conversationId: string | null): void {
  const raw = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!raw || raw.startsWith('draft:')) {
    if (activeConversationId) {
      sendJson({ type: 'leave', conversationId: activeConversationId });
    }
    activeConversationId = null;
    return;
  }
  if (activeConversationId && activeConversationId !== raw) {
    sendJson({ type: 'leave', conversationId: activeConversationId });
  }
  activeConversationId = raw;
  sendJson({ type: 'join', conversationId: raw });
}
