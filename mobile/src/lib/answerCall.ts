import { acceptCall, type CallMediaType } from '../api/calls';
import { useCallStore } from '../stores/callStore';

export type AnswerTarget = {
  callId: string;
  callerName: string;
  callType: CallMediaType;
  conversationId: string;
};

type Nav = { navigate: (screen: 'Call') => void };

/**
 * Принять входящий личный звонок: сообщить серверу и открыть экран звонка.
 * Общее место для кнопки в приложении, уведомления и системного экрана CallKit.
 * Возвращает текст ошибки или null.
 */
export async function answerIncomingCall(nav: Nav, target: AnswerTarget): Promise<string | null> {
  try {
    await acceptCall(target.callId);
  } catch (e) {
    return e instanceof Error && e.message ? e.message : 'Не удалось принять звонок';
  }
  const store = useCallStore.getState();
  store.openCall({
    callId: target.callId,
    kind: 'direct',
    mediaType: target.callType,
    title: target.callerName,
    peerName: target.callerName,
    isInitiator: false,
    conversationId: target.conversationId,
    phase: 'connecting',
  });
  store.setIncoming(null);
  nav.navigate('Call');
  return null;
}
