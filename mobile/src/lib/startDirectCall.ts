import { createDirectCall, type CallMediaType } from '../api/calls';
import { useCallStore } from '../stores/callStore';
import { hasNativeWebRtc } from './livekitNative';

export type DirectCallTarget = {
  conversationId: string;
  recipientId: number;
  peerName: string;
};

/**
 * Позвонить собеседнику в личном чате. Возвращает текст ошибки для показа или null, если звонок начат.
 * Личные звонки требуют встроенного WebRTC — в Expo Go их нет.
 */
export async function startDirectCall(target: DirectCallTarget, mediaType: CallMediaType): Promise<string | null> {
  if (!hasNativeWebRtc()) {
    return 'Личные звонки доступны в установленном приложении. В Expo Go можно создать встречу по ссылке.';
  }
  const current = useCallStore.getState().active;
  if (current && current.phase !== 'ended') return 'Вы уже участвуете в звонке.';
  try {
    const call = await createDirectCall({
      conversationId: target.conversationId,
      recipientId: target.recipientId,
      mediaType,
    });
    useCallStore.getState().openCall({
      callId: call.id,
      kind: 'direct',
      mediaType,
      title: target.peerName,
      peerName: target.peerName,
      isInitiator: true,
      conversationId: target.conversationId,
      phase: 'calling',
    });
    return null;
  } catch (e) {
    return e instanceof Error && e.message ? e.message : 'Не удалось начать звонок';
  }
}
