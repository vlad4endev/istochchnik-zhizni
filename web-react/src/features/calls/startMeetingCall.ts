import { emitAppToast } from '../../lib/uiFeedback';

import { createGroupCall, createStandaloneCall, type CallMediaType } from './callsApi';
import { unlockCallAudio } from './callRingtone';
import { useCallStore } from './callStore';
import { copyInviteShare } from './inviteShare';
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
  /** Пользовательское название конференции. */
  title?: string;
};

export type StandaloneMeetingResult = {
  inviteUrl: string | null;
  callId: string;
  title: string;
};

/**
 * Создать конференцию в существующем чате со ссылкой:
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
    title: opts.title,
  });

  const displayName =
    call.title?.trim() ||
    opts.peerName?.trim() ||
    opts.title?.trim() ||
    'Конференция';

  useCallStore.getState().openCall({
    callId: call.id,
    conversationId: opts.conversationId,
    peerId: 0,
    peerName: displayName,
    peerAvatar: opts.peerAvatar ?? '',
    callType: mediaType,
    isInitiator: true,
    status: 'active',
    callKind: 'group',
    inviteUrl: call.inviteUrl,
  });

  if (opts.copyLink !== false && call.inviteUrl) {
    const ok = await copyInviteShare(displayName, call.inviteUrl);
    if (ok) {
      emitAppToast('Название и ссылка скопированы — отправьте участникам', 'success');
    } else {
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
 * Встреча из списка чатов (кнопка камеры): только звонок + ссылка, как в Телемосте.
 * Группа/чат не создаётся; после завершения окно закрывается.
 */
export type StandaloneMeetingMediaPrefs = {
  title?: string;
  micOn?: boolean;
  camOn?: boolean;
};

export async function startStandaloneMeetingCall(
  mediaType: CallMediaType = 'video',
  opts?: StandaloneMeetingMediaPrefs,
): Promise<StandaloneMeetingResult | null> {
  if (!CALLS_FEATURE_ENABLED) {
    emitAppToast('Звонки временно отключены', 'info');
    return null;
  }

  const kind: CallMediaType = mediaType === 'audio' ? 'audio' : 'video';
  const fallback = kind === 'video' ? 'Видеовстреча' : 'Аудиовстреча';
  const micOn = opts?.micOn !== false;
  const camOn = kind === 'video' && opts?.camOn !== false;

  requestCallNotificationsFromUserGesture();
  unlockCallAudio();

  const call = await createStandaloneCall({ mediaType: kind, title: opts?.title });
  const title = call.title?.trim() || opts?.title?.trim() || fallback;

  useCallStore.getState().openCall({
    callId: call.id,
    conversationId: '',
    peerId: 0,
    peerName: title,
    peerAvatar: '',
    callType: kind,
    isInitiator: true,
    status: 'active',
    callKind: 'group',
    inviteUrl: call.inviteUrl,
    initialMicOn: micOn,
    initialCamOn: camOn,
  });

  if (call.inviteUrl) {
    const ok = await copyInviteShare(title, call.inviteUrl);
    if (ok) {
      emitAppToast('Название и ссылка скопированы — отправьте участникам', 'success');
    } else {
      emitAppToast('Встреча создана. Скопируйте ссылку в окне звонка.', 'info');
    }
  } else {
    emitAppToast(kind === 'video' ? 'Видеовстреча создана' : 'Аудиовстреча создана', 'success');
  }

  return { callId: call.id, inviteUrl: call.inviteUrl ?? null, title };
}
