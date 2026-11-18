import type { CallStatus } from './callsApi';

/**
 * Страховка от потерянных WS-событий звонка.
 *
 * Если сокет переподключался в момент `call:accepted` / `call:cancelled`, клиент застревал:
 * звонящий слушал гудки при уже принятом звонке, а у получателя бесконечно висел входящий.
 * Пока звонок в «переходном» состоянии, клиент сверяется с сервером (REST) и применяет решение.
 */

/** Как часто сверяться с сервером, пока идут гудки. */
export const CALL_SYNC_POLL_MS = 4000;

export type LocalRingState = 'calling' | 'ringing_in';

export type CallSyncAction =
  | { kind: 'none' }
  /** Звонящий: собеседник ответил — подключаемся к комнате. */
  | { kind: 'activate' }
  /** Звонок завершился на сервере — закрыть UI с понятным сообщением. */
  | { kind: 'close'; message: string | null };

const TERMINAL: ReadonlySet<CallStatus> = new Set([
  'ended',
  'declined',
  'missed',
  'cancelled',
  'failed',
]);

export function isTerminalCallStatus(status: CallStatus): boolean {
  return TERMINAL.has(status);
}

function terminalMessage(local: LocalRingState, status: CallStatus): string | null {
  switch (status) {
    case 'declined':
      return local === 'calling' ? 'Звонок отклонён' : null;
    case 'missed':
      return local === 'calling' ? 'Абонент не ответил' : 'Пропущенный вызов';
    case 'cancelled':
      return local === 'ringing_in' ? 'Звонок отменён' : null;
    case 'failed':
      return 'Звонок не состоялся';
    default:
      return local === 'ringing_in' ? 'Звонок завершён' : null;
  }
}

/**
 * Решение по серверному статусу для локального «переходного» состояния.
 * `acceptedHere` — пользователь только что нажал «Принять» на этом устройстве.
 */
export function resolveCallSync(
  local: LocalRingState,
  server: CallStatus,
  acceptedHere = false,
): CallSyncAction {
  if (isTerminalCallStatus(server)) {
    return { kind: 'close', message: terminalMessage(local, server) };
  }
  if (server === 'active') {
    if (local === 'calling') return { kind: 'activate' };
    // Входящий, но звонок уже идёт и принят не здесь — значит, на другом устройстве.
    if (!acceptedHere) return { kind: 'close', message: 'Звонок принят на другом устройстве' };
  }
  return { kind: 'none' };
}

/** Звонки, принятые на этом устройстве: свои же `call:answered_elsewhere` игнорируем. */
const acceptedLocally = new Map<string, number>();
const ACCEPTED_TTL_MS = 120_000;

export function markCallAcceptedLocally(callId: string): void {
  if (!callId) return;
  acceptedLocally.set(callId, Date.now());
  for (const [id, at] of acceptedLocally) {
    if (Date.now() - at > ACCEPTED_TTL_MS) acceptedLocally.delete(id);
  }
}

export function wasCallAcceptedLocally(callId: string): boolean {
  const at = acceptedLocally.get(callId);
  return at != null && Date.now() - at <= ACCEPTED_TTL_MS;
}

/** Причина `call:ended` → текст для пользователя (null — без тоста). */
export function callEndedMessage(reason: string | undefined): string | null {
  switch (reason) {
    case 'no_answer':
      return 'Абонент не ответил';
    case 'peer_lost':
      return 'Связь с собеседником потеряна — звонок завершён';
    case 'ended_by_moderator':
      return 'Организатор завершил встречу';
    default:
      return null;
  }
}
