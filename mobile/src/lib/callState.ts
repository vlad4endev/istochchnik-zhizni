import type { CallMediaType } from '../api/calls';

export type CallKind = 'direct' | 'group';
/** calling — исходящий ждёт ответа; connecting — получаем доступ к комнате; active — идёт разговор. */
export type CallPhase = 'calling' | 'connecting' | 'active' | 'ended';

export type CallEvent =
  | { type: 'call:accepted'; callId: string }
  | { type: 'call:rejected'; callId: string; reason?: string }
  | { type: 'call:cancelled'; callId: string }
  | { type: 'call:ended'; callId: string; reason?: string }
  | { type: 'call:error'; callId: string; error: string };

export type ActiveCall = {
  callId: string;
  kind: CallKind;
  mediaType: CallMediaType;
  title: string;
  isInitiator: boolean;
  phase: CallPhase;
  conversationId?: string;
  inviteUrl?: string | null;
  inviteToken?: string | null;
  peerName?: string;
  /** Причина завершения для показа пользователю. */
  endedMessage?: string | null;
};

const ERROR_TEXT: Record<string, string> = {
  busy: 'Абонент занят',
  already_in_call: 'Вы уже участвуете в другом звонке',
  user_offline: 'Абонент не в сети',
  forbidden: 'Нет доступа к звонку',
  invalid: 'Не удалось начать звонок',
};

export function callErrorText(code: string): string {
  return ERROR_TEXT[code] ?? 'Не удалось начать звонок';
}

/**
 * Как событие сервера меняет текущий звонок. События чужих звонков игнорируются.
 * Принятие переводит звонок в «подключение»: комнату открывает экран звонка.
 */
export function applyCallEvent(call: ActiveCall | null, ev: CallEvent): ActiveCall | null {
  if (!call || call.callId !== ev.callId || call.phase === 'ended') return call;
  switch (ev.type) {
    case 'call:accepted':
      return call.phase === 'calling' ? { ...call, phase: 'connecting' } : call;
    case 'call:rejected':
      return { ...call, phase: 'ended', endedMessage: 'Звонок отклонён' };
    case 'call:cancelled':
      return { ...call, phase: 'ended', endedMessage: 'Звонок отменён' };
    case 'call:ended':
      return { ...call, phase: 'ended', endedMessage: 'Звонок завершён' };
    case 'call:error':
      return { ...call, phase: 'ended', endedMessage: callErrorText(ev.error) };
    default:
      return call;
  }
}

/** Причины, после которых переподключаться нельзя: комнаты нет, нас убрали или вошли с другого устройства. */
const HARD_END = new Set([
  'ROOM_DELETED',
  'PARTICIPANT_REMOVED',
  'SERVER_SHUTDOWN',
  'DUPLICATE_IDENTITY',
  'ROOM_CLOSED',
]);

export function isHardEnd(reasonName: string | null | undefined): boolean {
  return reasonName != null && HARD_END.has(reasonName);
}

export function disconnectMessage(reasonName: string | null | undefined): string {
  return reasonName === 'DUPLICATE_IDENTITY' ? 'Звонок открыт на другом устройстве' : 'Звонок завершён';
}

/** «05:07» или «1:02:05» — сколько идёт звонок. */
export function elapsedLabel(startedAtMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Сколько плиток и как раскладывать участников: 1 — на весь экран, 2 — столбиком, дальше сеткой. */
export function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  return 3;
}
