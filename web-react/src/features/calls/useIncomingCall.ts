import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { emitAppToast } from '../../lib/uiFeedback';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

import { acceptCall, declineCall } from './callsApi';
import { useCallStore } from './callStore';
import {
  dismissIncomingCallBrowserNotification,
  notifyIncomingCallBackground,
} from './incomingCallBackground';

export interface IncomingCallPayload {
  callId: string;
  callerId: number;
  conversationId: string;
  callType: 'audio' | 'video';
  callerName: string;
  callerAvatar: string | null;
}

export function useIncomingCall() {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);

  useEffect(() => {
    return subscribeRealtimeMessages((raw) => {
      const m = raw as {
        type?: string;
        callId?: string;
        callerId?: number;
        conversationId?: string;
        callType?: string;
        callerName?: string;
        callerAvatar?: string | null;
      };
      if (m.type === 'call:incoming') {
        const next: IncomingCallPayload = {
          callId: String(m.callId),
          callerId: Number(m.callerId),
          conversationId: String(m.conversationId),
          callType: m.callType === 'video' ? 'video' : 'audio',
          callerName: String(m.callerName || 'Собеседник'),
          callerAvatar: m.callerAvatar != null ? String(m.callerAvatar) : null,
        };
        setIncomingCall(next);
        notifyIncomingCallBackground({
          callId: next.callId,
          callerName: next.callerName,
          callType: next.callType,
          callerAvatar: next.callerAvatar,
        });
        return;
      }
      if (m.type === 'call:cancelled' || m.type === 'call:ended' || m.type === 'call:rejected') {
        const callId = String(m.callId ?? '');
        dismissIncomingCallBrowserNotification(callId);
        setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
      }
    });
  }, []);

  const accept = async () => {
    if (!incomingCall) return;
    dismissIncomingCallBrowserNotification(incomingCall.callId);
    try {
      await acceptCall(incomingCall.callId);
      useCallStore.getState().openCall({
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        peerId: incomingCall.callerId,
        peerName: incomingCall.callerName,
        peerAvatar: incomingCall.callerAvatar ?? '',
        callType: incomingCall.callType,
        isInitiator: false,
        status: 'active',
        callKind: 'direct',
      });
      setIncomingCall(null);
      void navigate(`/call/${incomingCall.callId}`);
    } catch (e) {
      emitAppToast(e instanceof Error ? e.message : 'Не удалось принять звонок', 'error');
      setIncomingCall(null);
    }
  };

  const reject = async () => {
    if (!incomingCall) return;
    dismissIncomingCallBrowserNotification(incomingCall.callId);
    try {
      await declineCall(incomingCall.callId);
    } catch {
      /* already ended */
    }
    setIncomingCall(null);
  };

  return { incomingCall, accept, reject };
}
