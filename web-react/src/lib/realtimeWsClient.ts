/**
 * Одно WebSocket-подключение на сессию: мессенджер + инвалидация React Query.
 * Раньше useMessengerWs и useRealtimeQuerySync открывали по сокету — дубли комнат, трафика и гонки.
 */
import { useEffect } from 'react';

import { normalizeRegistrationStatus, useAuthStore } from '../features/auth/authStore';
import { COOKIE_ONLY_SESSION_TOKEN } from './authSessionConstants';
import { AUTH_API_PREFIX, resolveAxiosBaseURL, resolveRealtimeWebSocketUrl } from './config';

const LOG_PREFIX = '[realtime:ws]';

type OpenDetail = { wasReconnected: boolean };
type MessageHandler = (msg: unknown) => void;
type OpenHandler = (detail: OpenDetail) => void;

const messageHandlers = new Set<MessageHandler>();
const openHandlers = new Set<OpenHandler>();

let ws: WebSocket | null = null;
let authToken: string | null = null;
let stopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
/** После обрыва: номер «волны» переподключения (для wasReconnected). */
let reconnectGeneration = 0;
const MIN_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30_000;
let reconnectBackoffMs = MIN_RECONNECT_MS;
let stableOpenTimer: ReturnType<typeof setTimeout> | undefined;

/** Активный чат — повторный `join` сразу после auth (вкладка / восстановление WS). */
let activeMessengerConversationId: string | null = null;

/**
 * Сообщить, какой чат сейчас открыт (без импорта chatStore — избегаем цикла модулей).
 * Черновики `draft:…` игнорируются.
 */
export function notifyActiveMessengerConversationId(conversationId: string | null): void {
  const raw = typeof conversationId === 'string' ? conversationId.trim() : '';
  if (!raw || raw.startsWith('draft:')) {
    activeMessengerConversationId = null;
    return;
  }
  activeMessengerConversationId = raw;
}

/**
 * Таймеры heartbeat привязаны к конкретному экземпляру `WebSocket`, а не к модулю:
 * иначе при быстрых реконнектах (2G/visibilitychange + online) handle старого интервала
 * теряется и навсегда остаётся активным — утечка памяти + CPU.
 *
 * `Map` (а не `WeakMap`), чтобы иметь возможность перебрать и погасить все сразу
 * в `clearAllSocketTimers()` без ожидания GC.
 */
type SocketTimers = {
  ping?: ReturnType<typeof setInterval>;
  pongDeadline?: ReturnType<typeof setTimeout>;
};
const socketTimers = new Map<WebSocket, SocketTimers>();

/** Последний `ready` для подписчиков, подключившихся после открытия сокета */
let lastReadyPayload: { memberId: number; onlineMembers: number[]; v?: number } | null = null;

let globalListenersAttached = false;

function attachGlobalNetworkListeners(): void {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;

  window.addEventListener('online', () => {
    if (stopped || !authToken) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    reconnectBackoffMs = MIN_RECONNECT_MS;
    clearTimers();
    reconnectGeneration = 0;
    openSocket();
  });

  window.addEventListener('offline', () => {
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (stopped || !authToken) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    reconnectBackoffMs = MIN_RECONNECT_MS;
    clearTimers();
    reconnectGeneration = 0;
    openSocket();
  });
}

function logInfo(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.info(LOG_PREFIX, message, extra);
  } else {
    console.info(LOG_PREFIX, message);
  }
}

function logWarn(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.warn(LOG_PREFIX, message, extra);
  } else {
    console.warn(LOG_PREFIX, message);
  }
}

function clearPongDeadline(socket: WebSocket): void {
  const t = socketTimers.get(socket);
  if (!t) return;
  if (t.pongDeadline !== undefined) {
    clearTimeout(t.pongDeadline);
    t.pongDeadline = undefined;
  }
}

/** Полная очистка таймеров одного сокета + удаление записи из Map. */
function clearSocketTimers(socket: WebSocket | null | undefined): void {
  if (!socket) return;
  const t = socketTimers.get(socket);
  if (!t) return;
  if (t.ping !== undefined) {
    clearInterval(t.ping);
    t.ping = undefined;
  }
  if (t.pongDeadline !== undefined) {
    clearTimeout(t.pongDeadline);
    t.pongDeadline = undefined;
  }
  socketTimers.delete(socket);
}

/**
 * Снимает heartbeat со ВСЕХ зарегистрированных сокетов.
 * Вызывается в начале `openSocket()` и при разрыве, чтобы исключить утечки
 * «зомби-таймеров», указывающих на закрытые/замещённые экземпляры `WebSocket`.
 */
function clearAllSocketTimers(): void {
  for (const socket of Array.from(socketTimers.keys())) {
    clearSocketTimers(socket);
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function clearStableOpenTimer(): void {
  if (stableOpenTimer !== undefined) {
    clearTimeout(stableOpenTimer);
    stableOpenTimer = undefined;
  }
}

function clearTimers(): void {
  clearReconnectTimer();
  clearStableOpenTimer();
  clearAllSocketTimers();
}

function dispatchMessage(msg: unknown): void {
  for (const fn of messageHandlers) {
    try {
      fn(msg);
    } catch (e) {
      console.error(LOG_PREFIX, 'subscriber error', e);
    }
  }
}

function dispatchOpen(detail: OpenDetail): void {
  for (const fn of openHandlers) {
    try {
      fn(detail);
    } catch (e) {
      console.error(LOG_PREFIX, 'open subscriber error', e);
    }
  }
}

function scheduleReconnect(): void {
  if (stopped || !authToken) return;
  clearReconnectTimer();
  clearStableOpenTimer();
  clearAllSocketTimers();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    logInfo('reconnect: ждём online (offline)');
    return;
  }
  const jitter = Math.random() * 500;
  const delay = Math.min(reconnectBackoffMs + jitter, MAX_RECONNECT_MS + 500);
  logInfo(`reconnect: через ${Math.round(delay)}ms (база backoff ${reconnectBackoffMs}ms)`);
  reconnectBackoffMs = Math.min(reconnectBackoffMs * 2, MAX_RECONNECT_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    reconnectGeneration += 1;
    openSocket();
  }, delay);
}

async function refreshAccessToken(): Promise<void> {
  const origin =
    resolveAxiosBaseURL() ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  if (!origin) {
    throw new Error('missing base URL for auth refresh');
  }
  const refreshResponse = await fetch(`${origin}${AUTH_API_PREFIX}/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (refreshResponse.status !== 200) {
    throw new Error(`token refresh failed (${refreshResponse.status})`);
  }
  const refreshPayload = (await refreshResponse.json()) as { accessToken?: string; token?: string };
  const nextToken = String(refreshPayload.accessToken ?? refreshPayload.token ?? '').trim();
  if (!nextToken) {
    throw new Error('token refresh response has no access token');
  }
  const userResponse = await fetch(`${origin}${AUTH_API_PREFIX}/me`, {
    credentials: 'include',
  });
  if (userResponse.status !== 200) {
    throw new Error(`auth profile refresh failed (${userResponse.status})`);
  }
  const user = (await userResponse.json()) as {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    app_role?: string;
    app_roles?: string[];
    registration_status?: string;
    username?: string;
  };
  useAuthStore.getState().setSession({
    token: nextToken || COOKIE_ONLY_SESSION_TOKEN,
    firstName: (user.first_name ?? '').trim(),
    lastName: (user.last_name ?? '').trim(),
    role: (user.app_role ?? 'member').trim() || 'member',
    roles: Array.isArray(user.app_roles) ? user.app_roles : undefined,
    registrationStatus: normalizeRegistrationStatus(user.registration_status),
    username: (user.username ?? '').trim(),
    memberId: typeof user.id === 'number' ? user.id : null,
  });
  authToken = useAuthStore.getState().token;
}

function openSocket(): void {
  if (stopped || !authToken) return;
  // Первая строка: снимаем ВСЕ heartbeat старых экземпляров (reconnect-шторм,
  // online+visibilitychange подряд) и отменяем запланированный реконнект.
  clearTimers();

  const url = resolveRealtimeWebSocketUrl();
  if (!url) {
    logWarn('URL пуст — WebSocket не поднимается');
    scheduleReconnect();
    return;
  }

  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    logWarn('new WebSocket() failed', { error: String(e) });
    scheduleReconnect();
    return;
  }

  ws = socket;
  const timers: SocketTimers = {};
  socketTimers.set(socket, timers);

  socket.onopen = () => {
    const wasReconnected = reconnectGeneration > 0;
    logInfo('open', { wasReconnected });
    try {
      socket.send(JSON.stringify({ type: 'auth', token: authToken }));
    } catch (e) {
      logWarn('auth send failed', { error: String(e) });
    }

    if (activeMessengerConversationId) {
      try {
        socket.send(
          JSON.stringify({ type: 'join', conversationId: activeMessengerConversationId }),
        );
      } catch (e) {
        logWarn('join active conversation failed', { error: String(e) });
      }
    }

    // Heartbeat: JSON ping (сервер отвечает { type: 'pong' }) + нативный ping от сервера (ws).
    // Таймеры привязаны к `socket`; при его замене очищаются из socketTimers.
    timers.ping = setInterval(() => {
      // Если сокет закрыт или замещён — гасим свой же интервал, чтобы не держать ссылку.
      if (socket.readyState !== WebSocket.OPEN || ws !== socket) {
        clearSocketTimers(socket);
        return;
      }
      clearPongDeadline(socket);
      try {
        socket.send(JSON.stringify({ type: 'ping' }));
      } catch (e) {
        logWarn('ping send failed', { error: String(e) });
      }
      timers.pongDeadline = setTimeout(() => {
        timers.pongDeadline = undefined;
        if (socket.readyState === WebSocket.OPEN && ws === socket) {
          logWarn('нет pong за 35s — закрываю сокет для переподключения');
          try {
            socket.close(4000, 'heartbeat');
          } catch {
            /* ignore */
          }
        }
      }, 35_000);
    }, 20_000);

    // Сбрасываем backoff только после устойчивого соединения >10 секунд.
    clearStableOpenTimer();
    stableOpenTimer = setTimeout(() => {
      if (ws === socket && socket.readyState === WebSocket.OPEN) {
        reconnectBackoffMs = MIN_RECONNECT_MS;
        reconnectGeneration = 0;
        logInfo('connection stable: reconnect backoff reset');
      }
      stableOpenTimer = undefined;
    }, 10_000);

    dispatchOpen({ wasReconnected });
  };

  socket.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data)) as { type?: string; memberId?: number; onlineMembers?: number[] };
      if (msg && msg.type === 'pong') {
        clearPongDeadline(socket);
        return;
      }
      if (msg && msg.type === 'ready' && typeof msg.memberId === 'number') {
        lastReadyPayload = {
          memberId: msg.memberId,
          onlineMembers: Array.isArray(msg.onlineMembers) ? msg.onlineMembers : [],
          v: 1,
        };
      }
      dispatchMessage(msg);
    } catch (e) {
      logWarn('parse message failed', { error: String(e) });
    }
  };

  socket.onerror = (ev) => {
    logWarn('socket error', { type: ev.type });
    // Error часто предшествует close; перестрахуемся и сразу снимаем heartbeat
    // этого экземпляра, чтобы он не пережил замену `ws`.
    clearSocketTimers(socket);
  };

  socket.onclose = (ev) => {
    logInfo('close', { code: ev.code, reason: ev.reason || '', wasClean: ev.wasClean });
    clearSocketTimers(socket);
    if (ws === socket) {
      ws = null;
    }
    if (stopped || !authToken) return;
    if (ev.code === 1008) {
      logWarn('auth rejected, refreshing token before reconnect');
      void refreshAccessToken()
        .then(() => {
          scheduleReconnect();
        })
        .catch(() => {
          void useAuthStore.getState().logout();
        });
      return;
    }
    scheduleReconnect();
  };
}

/**
 * Закрыть сокет и остановить переподключение (logout).
 */
export function closeRealtimeWs(): void {
  stopped = true;
  authToken = null;
  lastReadyPayload = null;
  reconnectBackoffMs = MIN_RECONNECT_MS;
  reconnectGeneration = 0;
  clearTimers();
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
}

/**
 * Открыть/обновить соединение с токеном.
 */
export function openRealtimeWs(token: string): void {
  const next = token.trim();
  if (!next) {
    closeRealtimeWs();
    return;
  }
  attachGlobalNetworkListeners();
  stopped = false;
  if (authToken === next && ws && ws.readyState === WebSocket.OPEN) {
    return;
  }
  authToken = next;
  clearTimers();
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  ws = null;
  reconnectBackoffMs = MIN_RECONNECT_MS;
  reconnectGeneration = 0;
  openSocket();
}

export function sendRealtimeJson(obj: object): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    logWarn('send failed', { error: String(e) });
    return false;
  }
}

export function isRealtimeWsOpen(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function subscribeRealtimeMessages(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  if (lastReadyPayload) {
    queueMicrotask(() =>
      handler({
        type: 'ready',
        v: 1,
        memberId: lastReadyPayload!.memberId,
        onlineMembers: lastReadyPayload!.onlineMembers,
      }),
    );
  }
  return () => {
    messageHandlers.delete(handler);
  };
}

export function subscribeRealtimeOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler);
  return () => {
    openHandlers.delete(handler);
  };
}

/**
 * Поднять одно соединение (вызывать из корневого layout при наличии токена).
 */
export function useRealtimeWsConnection(): void {
  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    if (!token) {
      closeRealtimeWs();
      return;
    }
    openRealtimeWs(token);
    return () => closeRealtimeWs();
  }, [token]);
}
