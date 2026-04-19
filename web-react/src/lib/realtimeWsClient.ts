/**
 * Одно WebSocket-подключение на сессию: мессенджер + инвалидация React Query.
 * Раньше useMessengerWs и useRealtimeQuerySync открывали по сокету — дубли комнат, трафика и гонки.
 */
import { useEffect } from 'react';

import { useAuthStore } from '../features/auth/authStore';
import { resolveRealtimeWebSocketUrl } from './config';

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
let attempt = 0;

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
    clearTimers();
    attempt = 0;
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
    clearTimers();
    attempt = 0;
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

function clearTimers(): void {
  clearReconnectTimer();
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

/**
 * Jitter ±20% (коэффициент 0.8–1.2) к экспоненциальному бэкаффу.
 * Зачем: после падения ноды API все активные клиенты одновременно
 * получают `close` и через фиксированный `attempt²`-тайминг вернутся
 * строго синхронно → «thundering herd» по API + load balancer.
 * Рандомизация размазывает возврат по окну и снимает пиковую нагрузку.
 */
function applyReconnectJitter(baseDelayMs: number): number {
  const factor = 0.8 + Math.random() * 0.4;
  return Math.round(baseDelayMs * factor);
}

function scheduleReconnect(): void {
  if (stopped || !authToken) return;
  clearTimers();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    logInfo('reconnect: ждём online (offline)');
    return;
  }
  attempt += 1;
  const baseDelay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
  const delay = applyReconnectJitter(baseDelay);
  logInfo(`reconnect: попытка ${attempt} через ${delay}ms (base ${baseDelay}ms ±20% jitter)`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    openSocket();
  }, delay);
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
    const wasReconnected = attempt > 0;
    attempt = 0;
    logInfo('open', { wasReconnected });
    try {
      socket.send(JSON.stringify({ type: 'auth', token: authToken }));
    } catch (e) {
      logWarn('auth send failed', { error: String(e) });
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
    if (!stopped && authToken) {
      scheduleReconnect();
    }
  };
}

/**
 * Закрыть сокет и остановить переподключение (logout).
 */
export function closeRealtimeWs(): void {
  stopped = true;
  authToken = null;
  lastReadyPayload = null;
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
  attempt = 0;
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
