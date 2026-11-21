import { Linking } from 'react-native';

import { parseInviteToken, type CallMediaType } from '../api/calls';
import { useCallStore } from '../stores/callStore';
import { hasNativeWebRtc } from './livekitNative';

type Navigate = { navigate: (screen: 'Call') => void };

/**
 * Открывает групповой звонок: внутри приложения (если в сборке есть WebRTC) или по ссылке в браузере.
 * `asHost` — создатель встречи входит по своему id, остальные — по приглашению.
 */
export function openGroupCall(
  nav: Navigate,
  opts: {
    inviteUrl: string;
    title: string;
    mediaType: CallMediaType;
    callId?: string;
    asHost?: boolean;
  },
): 'in-app' | 'browser' {
  const inviteToken = parseInviteToken(opts.inviteUrl);
  if (!hasNativeWebRtc() || (!inviteToken && !opts.callId)) {
    void Linking.openURL(opts.inviteUrl);
    return 'browser';
  }
  useCallStore.getState().openCall({
    callId: opts.callId ?? '',
    kind: 'group',
    mediaType: opts.mediaType,
    title: opts.title,
    isInitiator: opts.asHost === true,
    inviteUrl: opts.inviteUrl,
    inviteToken,
    phase: 'connecting',
  });
  nav.navigate('Call');
  return 'in-app';
}
