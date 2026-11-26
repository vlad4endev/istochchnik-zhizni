import type { ActiveCallState } from './callStore';

/**
 * Состояние звонка живёт в памяти. Когда мобильная ОС выгружает вкладку/PWA
 * (пока пользователь отправляет ссылку-приглашение в другой мессенджер), страница
 * перезагружается и звонок «исчезает». Сохраняем минимум для возврата в комнату.
 * LiveKit-токен НЕ сохраняем — при возврате берём свежий с сервера.
 */
export const CALL_PERSIST_KEY = 'app:active-call:v1';
export const CALL_PERSIST_TTL_MS = 6 * 60 * 60 * 1000;

type Persisted = Pick<
  ActiveCallState,
  | 'callId'
  | 'conversationId'
  | 'peerId'
  | 'peerName'
  | 'peerAvatar'
  | 'callType'
  | 'isInitiator'
  | 'callKind'
  | 'inviteUrl'
  | 'initialMicOn'
  | 'initialCamOn'
> & { savedAt: number };

export function persistCall(call: ActiveCallState, now: number = Date.now()): void {
  if (call.status !== 'active') return;
  const data: Persisted = {
    callId: call.callId,
    conversationId: call.conversationId,
    peerId: call.peerId,
    peerName: call.peerName,
    peerAvatar: call.peerAvatar,
    callType: call.callType,
    isInitiator: call.isInitiator,
    callKind: call.callKind,
    inviteUrl: call.inviteUrl ?? null,
    initialMicOn: call.initialMicOn,
    initialCamOn: call.initialCamOn,
    savedAt: now,
  };
  try {
    localStorage.setItem(CALL_PERSIST_KEY, JSON.stringify(data));
  } catch {
    /* приватный режим / квота — восстановление просто не сработает */
  }
}

export function clearPersistedCall(): void {
  try {
    localStorage.removeItem(CALL_PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPersistedCall(now: number = Date.now()): Persisted | null {
  try {
    const raw = localStorage.getItem(CALL_PERSIST_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Persisted> | null;
    if (
      !p ||
      typeof p.callId !== 'string' ||
      !p.callId ||
      typeof p.savedAt !== 'number' ||
      now - p.savedAt > CALL_PERSIST_TTL_MS
    ) {
      clearPersistedCall();
      return null;
    }
    return p as Persisted;
  } catch {
    clearPersistedCall();
    return null;
  }
}
