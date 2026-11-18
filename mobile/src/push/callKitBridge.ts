import type { AnswerTarget } from '../lib/answerCall';
import type { CallKitEndReason } from '../../modules/expo-callkit/src';

type Native = {
  getVoipToken(): string | null;
  // Типы событий проверяет сам модуль; здесь важна только подписка.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addListener(event: any, listener: (payload: any) => void): { remove(): void };
};

type StoreState = {
  active: { callId: string; phase: string } | null;
  incoming: { callId: string } | null;
};

export type CallKitBridgeDeps = {
  native: Native;
  deviceId: () => string;
  saveVoipToken: (token: string, deviceId: string) => Promise<void>;
  answer: (target: AnswerTarget) => Promise<string | null>;
  decline: (callId: string) => Promise<void>;
  endCallApi: (callId: string) => Promise<void>;
  /** Состояние звонков приложения. */
  getState: () => StoreState;
  subscribe: (listener: (state: StoreState, prev: StoreState) => void) => () => void;
  closeActiveCall: () => void;
  clearIncoming: () => void;
  markReported: (callId: string) => void;
  forgetReported: (callId: string) => void;
  callKitHas: (callId: string) => boolean;
  reportEnded: (callId: string, reason: CallKitEndReason) => void;
  requestEnd: (callId: string) => Promise<void>;
  /** Сообщить WebRTC, что система включила/выключила аудио-сессию звонка. */
  audioSession: (active: boolean) => void;
  alert: (message: string) => void;
};

type Answer = AnswerTarget & { callerId: string; callerAvatar: string };

/**
 * Связывает системный экран звонка iPhone (CallKit) с приложением:
 * токен для сервера, ответ и сброс на системном экране, звук, закрытие экрана по окончании звонка.
 * Все зависимости передаются снаружи, чтобы логику можно было проверить без телефона.
 */
export function startCallKitBridge(d: CallKitBridgeDeps): () => void {
  const subs: Array<{ remove(): void }> = [];
  const listen = <T,>(event: string, handler: (payload: T) => void) => {
    subs.push(d.native.addListener(event, handler));
  };

  const sendToken = (token: string) => {
    if (token) void d.saveVoipToken(token, d.deviceId()).catch(() => undefined);
  };
  const existing = d.native.getVoipToken();
  if (existing) sendToken(existing);
  listen<{ token: string }>('onVoipToken', (e) => sendToken(e.token));

  // Система показала звонок: наш экран «Входящий» для него не нужен.
  listen<{ callId: string }>('onIncomingCall', (e) => {
    d.markReported(e.callId);
    if (d.getState().incoming?.callId === e.callId) d.clearIncoming();
  });

  // «Принять» на системном экране (в том числе при запуске приложения из закрытого состояния).
  listen<Answer>('onAnswerCall', (e) => {
    void (async () => {
      const err = await d.answer({
        callId: e.callId,
        callerName: e.callerName,
        callType: e.callType,
        conversationId: e.conversationId,
      });
      if (err) {
        d.alert(err);
        d.reportEnded(e.callId, 'failed');
      }
    })();
  });

  // «Отклонить» или «Завершить» на системном экране.
  listen<{ callId: string; answered: boolean }>('onEndCall', (e) => {
    d.forgetReported(e.callId);
    if (!e.answered) {
      void d.decline(e.callId).catch(() => undefined);
      if (d.getState().incoming?.callId === e.callId) d.clearIncoming();
      return;
    }
    const active = d.getState().active;
    if (active?.callId === e.callId && active.phase !== 'ended') {
      void d.endCallApi(e.callId).catch(() => undefined);
      d.closeActiveCall();
    }
  });

  listen<{ active: boolean }>('onAudioSession', (e) => d.audioSession(e.active));

  // Звонок закончился в приложении — закрыть и системный экран.
  subs.push({
    remove: d.subscribe((state, prev) => {
      const incomingGone = prev.incoming?.callId;
      if (incomingGone && !state.incoming && state.active?.callId !== incomingGone && d.callKitHas(incomingGone)) {
        d.reportEnded(incomingGone, 'remoteEnded');
      }
      const was = prev.active;
      if (was && d.callKitHas(was.callId)) {
        const closed = !state.active || state.active.callId !== was.callId;
        const ended = state.active?.callId === was.callId && state.active.phase === 'ended' && was.phase !== 'ended';
        if (closed || ended) void d.requestEnd(was.callId);
      }
    }),
  });

  return () => subs.forEach((s) => s.remove());
}
