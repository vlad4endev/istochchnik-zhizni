import { emitAppToast } from '../../lib/uiFeedback';
import { createGroupChat } from '../messenger/api/messengerApi';
import { useChatStore } from '../messenger/chatStore';

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

export type StandaloneMeetingResult = {
  conversationId: string;
  inviteUrl: string | null;
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

/**
 * Конференция из списка чатов («+»): отдельная группа + ссылка (как Телемост).
 */
export async function startStandaloneMeetingCall(
  mediaType: CallMediaType = 'video',
): Promise<StandaloneMeetingResult | null> {
  if (!CALLS_FEATURE_ENABLED) {
    emitAppToast('Звонки временно отключены', 'info');
    return null;
  }

  const kind: CallMediaType = mediaType === 'audio' ? 'audio' : 'video';
  const title = kind === 'video' ? 'Видеоконференция' : 'Аудиоконференция';
  const created = await createGroupChat(title, 'group', []);
  const conversationId = String(created.conversationId ?? '');
  if (!conversationId) {
    throw new Error('Не удалось создать чат для конференции');
  }

  const store = useChatStore.getState();
  if (created.conversation) {
    store.handleConvCreated(created.conversation);
  } else {
    await store.loadConversations({ force: true });
  }

  const inviteUrl = await startMeetingCall({
    conversationId,
    mediaType: kind,
    peerName: title,
    peerAvatar: created.conversation?.avatar_url ?? '',
  });

  return { conversationId, inviteUrl };
}
