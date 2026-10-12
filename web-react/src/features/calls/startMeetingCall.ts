import { emitAppToast } from '../../lib/uiFeedback';

import { createGroupCall, type CallMediaType } from './callsApi';
import { unlockCallAudio } from './callRingtone';
import { useCallStore } from './callStore';
import { requestCallNotificationsFromUserGesture } from './incomingCallBackground';

const CALLS_FEATURE_ENABLED = import.meta.env.VITE_CALLS_ENABLED === 'true';

export type StartMeetingOptions = {
  conversationId: string;
  mediaType?: CallMediaType;
  /** Название для окна звонка (группа / собеседник). */
  peerName?: string;
  peerAvatar?: string;
  /** Скопировать ссылку в буфер после создания. */
  copyLink?: boolean;
};

/**
 * Создать конференцию со ссылкой (режим Телемост/Zoom):
 * комната → invite URL в чат → хост ждёт подключений.
 */
export async function startMeetingCall(opts: StartMeetingOptions): Promise<string | null> {
  if (!CALLS_FEATURE_ENABLED) {
    emitAppToast('Звонки временно отключены', 'info');
    return null;
  }

  const mediaType: CallMediaType = opts.mediaType === 'audio' ? 'audio' : 'video';
  requestCallNotificationsFromUserGesture();
  unlockCallAudio();

  const call = await createGroupCall({
    conversationId: opts.conversationId,
    mediaType,
    accessMode: 'link',
  });

  useCallStore.getState().openCall({
    callId: call.id,
    conversationId: opts.conversationId,
    peerId: 0,
    peerName: opts.peerName?.trim() || 'Конференция',
    peerAvatar: opts.peerAvatar ?? '',
    callType: mediaType,
    isInitiator: true,
    status: 'active',
    callKind: 'group',
    inviteUrl: call.inviteUrl,
  });

  if (opts.copyLink !== false && call.inviteUrl) {
    try {
      await navigator.clipboard.writeText(call.inviteUrl);
      emitAppToast('Ссылка на звонок скопирована — отправьте её участникам', 'success');
    } catch {
      emitAppToast('Конференция создана. Скопируйте ссылку в окне звонка.', 'info');
    }
  } else {
    emitAppToast(
      mediaType === 'video' ? 'Видеоконференция создана' : 'Аудиоконференция создана',
      'success',
    );
  }

  return call.inviteUrl ?? null;
}
