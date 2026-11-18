import type { CallMediaType } from '../api/calls';

export const CALL_CHANNEL_ID = 'calls';
export const CALL_CATEGORY_ID = 'incoming_call';
export const ACTION_ACCEPT = 'call_accept';
export const ACTION_DECLINE = 'call_decline';
/** Если сервер не сообщил срок звонка, считаем его живым столько секунд от отправки. */
export const DEFAULT_RING_TTL_SEC = 90;

export type IncomingCallPush = {
  kind: 'incoming';
  callId: string;
  callerId: number;
  callerName: string;
  callerAvatar: string | null;
  callType: CallMediaType;
  conversationId: string;
};

export type CallEndedPush = { kind: 'ended'; callId: string };

type Data = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Разбирает данные пуша от сервера. Сервер шлёт `incoming_call` при звонке и
 * `call_ended`/`call_cancelled`, когда звонок закончился. Всё остальное — null.
 */
export function parseCallPush(data: Data): IncomingCallPush | CallEndedPush | null {
  if (!data) return null;
  const type = str(data.type);
  const callId = str(data.callId);
  if (!callId) return null;
  if (type === 'call_ended' || type === 'call_cancelled') return { kind: 'ended', callId };
  if (type !== 'incoming_call') return null;
  return {
    kind: 'incoming',
    callId,
    callerId: Number(str(data.callerId)) || 0,
    callerName: str(data.callerName) || 'Собеседник',
    callerAvatar: str(data.callerAvatar) || null,
    callType: str(data.callType) === 'video' ? 'video' : 'audio',
    conversationId: str(data.conversationId),
  };
}

/** Идентификатор уведомления: один звонок — одно уведомление, чтобы его можно было снять. */
export function callNotificationId(callId: string): string {
  return `call-${callId}`;
}

/** Звонок уже наверняка закончился, показывать «входящий» поздно. */
export function isRingExpired(sentTimeMs: number | null | undefined, nowMs: number, ttlSec = DEFAULT_RING_TTL_SEC): boolean {
  if (!sentTimeMs || !Number.isFinite(sentTimeMs)) return false;
  return nowMs - sentTimeMs > ttlSec * 1000;
}

export type IncomingNotificationContent = {
  title: string;
  body: string;
  /** Данные нужны, чтобы по нажатию восстановить звонок. */
  data: Record<string, string>;
};

export function buildIncomingNotification(call: IncomingCallPush): IncomingNotificationContent {
  return {
    title: call.callType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок',
    body: call.callerName,
    data: {
      type: 'incoming_call',
      callId: call.callId,
      callerId: String(call.callerId),
      callerName: call.callerName,
      callerAvatar: call.callerAvatar ?? '',
      callType: call.callType,
      conversationId: call.conversationId,
    },
  };
}

export type CallIntent =
  | { type: 'open'; call: IncomingCallPush }
  | { type: 'accept'; call: IncomingCallPush }
  | { type: 'decline'; call: IncomingCallPush };

/**
 * Что сделать, когда пользователь нажал на уведомление о звонке.
 * Нажатие на само уведомление открывает экран с выбором, кнопки — действуют сразу.
 */
export function intentFromNotification(actionId: string | null | undefined, data: Data): CallIntent | null {
  const parsed = parseCallPush(data);
  if (!parsed || parsed.kind !== 'incoming') return null;
  if (actionId === ACTION_ACCEPT) return { type: 'accept', call: parsed };
  if (actionId === ACTION_DECLINE) return { type: 'decline', call: parsed };
  return { type: 'open', call: parsed };
}

/** Звонок ещё можно принять только пока он звонит. */
export function isRinging(status: string | null | undefined): boolean {
  return status === 'ringing';
}

export type IntentDecision =
  | { action: 'call-ended' }
  | { action: 'show-incoming'; call: IncomingCallPush }
  | { action: 'accept'; call: IncomingCallPush }
  | { action: 'decline'; call: IncomingCallPush };

/**
 * Итог после проверки звонка на сервере: если он уже не звонит (собеседник сбросил, мы ответили
 * с другого устройства) — ничего не принимаем и сообщаем об этом.
 */
export function decideIntent(intent: CallIntent, serverStatus: string | null): IntentDecision {
  if (!isRinging(serverStatus)) return { action: 'call-ended' };
  if (intent.type === 'accept') return { action: 'accept', call: intent.call };
  if (intent.type === 'decline') return { action: 'decline', call: intent.call };
  return { action: 'show-incoming', call: intent.call };
}
