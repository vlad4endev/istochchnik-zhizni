import { useCallback, useEffect, useState } from 'react';

import { sendRealtimeJson, subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

import {
  dismissIncomingCallBrowserNotification,
  notifyIncomingCallBackground,
} from './incomingCallBackground';
import { useCallStore } from './callStore';

export interface IncomingCallPayload {
  callId: string;
  callerId: number;
  callerName: string;
  callerAvatar: string | null;
  conversationId: string;
  callType: 'audio' | 'video';
}

export function useIncomingCall() {
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);

  useEffect(() => {
    const unsub = subscribeRealtimeMessages((raw) => {
      const m = raw as Record<string, unknown>;
      if (m.type === 'call:incoming') {
        const callId = typeof m.callId === 'string' ? m.callId : '';
        const callerId = typeof m.callerId === 'number' ? m.callerId : Number(m.callerId);
        const conversationId = typeof m.conversationId === 'string' ? m.conversationId : '';
        const callTypeRaw = m.callType === 'video' || m.callType === 'audio' ? m.callType : null;
        const callerName = typeof m.callerName === 'string' ? m.callerName : '';
        const callerAvatar = m.callerAvatar != null ? String(m.callerAvatar) : null;
        if (!callId || !Number.isFinite(callerId) || !conversationId || !callTypeRaw) return;
        const callType = callTypeRaw;
        const next: IncomingCallPayload = {
          callId,
          callerId,
          callerName,
          callerAvatar,
          conversationId,
          callType,
        };
        setIncomingCall(next);
        notifyIncomingCallBackground({
          callId,
          callerName,
          callType,
          callerAvatar,
        });
        return;
      }
      if (m.type === 'call:cancelled' || m.type === 'call:ended') {
        const callId = typeof m.callId === 'string' ? m.callId : '';
        dismissIncomingCallBrowserNotification(callId);
        setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
      }
    });
    return unsub;
  }, []);

  const accept = useCallback(() => {
    if (!incomingCall) return;
    dismissIncomingCallBrowserNotification(incomingCall.callId);
    sendRealtimeJson({ type: 'call:accept', callId: incomingCall.callId });
    useCallStore.getState().openCall({
      callId: incomingCall.callId,
      conversationId: incomingCall.conversationId,
      peerId: incomingCall.callerId,
      peerName: incomingCall.callerName,
      peerAvatar: incomingCall.callerAvatar ?? '',
      callType: incomingCall.callType,
      isInitiator: false,
    });
    setIncomingCall(null);
  }, [incomingCall]);

  const reject = useCallback(() => {
    if (!incomingCall) return;
    dismissIncomingCallBrowserNotification(incomingCall.callId);
    sendRealtimeJson({ type: 'call:reject', callId: incomingCall.callId, reason: 'declined' });
    setIncomingCall(null);
  }, [incomingCall]);

  return { incomingCall, accept, reject };
}
