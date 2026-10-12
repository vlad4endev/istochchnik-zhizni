import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { emitAppToast } from '../../lib/uiFeedback';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';
import { isCapacitorNative } from '../../lib/nativeApp';
import { NativeCall, type NativeIncomingCallPayload } from '../../plugins/nativeCall';

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

function normalizeIncoming(raw: {
  callId?: string;
  callerId?: number | string;
  conversationId?: string;
  callType?: string;
  callerName?: string;
  callerAvatar?: string | null;
}): IncomingCallPayload {
  return {
    callId: String(raw.callId ?? ''),
    callerId: Number(raw.callerId) || 0,
    conversationId: String(raw.conversationId ?? ''),
    callType: raw.callType === 'video' ? 'video' : 'audio',
    callerName: String(raw.callerName || 'Собеседник'),
    callerAvatar: raw.callerAvatar != null ? String(raw.callerAvatar) : null,
  };
}

function fromNativePayload(p: NativeIncomingCallPayload): IncomingCallPayload {
  return normalizeIncoming({
    callId: p.callId,
    callerId: p.callerId,
    conversationId: p.conversationId,
    callType: p.callType,
    callerName: p.callerName,
    callerAvatar: p.callerAvatar,
  });
}

export function useIncomingCall() {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  /** Нативный CallKit/CallStyle уже звонит — не дублируем ringtone в WebView. */
  const [suppressWebRingtone, setSuppressWebRingtone] = useState(false);

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
        const next = normalizeIncoming(m);
        setIncomingCall(next);
        // Foreground: WebView ringtone; native CallStyle только в фоне
        setSuppressWebRingtone(false);
        if (!isCapacitorNative()) {
          notifyIncomingCallBackground({
            callId: next.callId,
            callerName: next.callerName,
            callType: next.callType,
            callerAvatar: next.callerAvatar,
          });
        }
        return;
      }
      if (m.type === 'call:cancelled' || m.type === 'call:ended' || m.type === 'call:rejected') {
        const callId = String(m.callId ?? '');
        dismissIncomingCallBrowserNotification(callId);
        setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
        setSuppressWebRingtone(false);
        if (isCapacitorNative() && callId) {
          void NativeCall.endCall({ callId }).catch(() => undefined);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!isCapacitorNative()) return;

    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const setup = async () => {
      try {
        const { supported } = await NativeCall.isSupported();
        if (cancelled || !supported) return;

        handles.push(
          await NativeCall.addListener('incoming', (ev) => {
            const next = fromNativePayload(ev);
            if (!next.callId) return;
            setIncomingCall(next);
            // Нативный UI уже звонит (фон / lock screen)
            setSuppressWebRingtone(true);
          }),
        );

        handles.push(
          await NativeCall.addListener('accepted', (ev) => {
            const callId = String(ev.callId ?? '');
            if (!callId) return;
            setIncomingCall((cur) => {
              const payload =
                cur && cur.callId === callId
                  ? cur
                  : fromNativePayload(ev as NativeIncomingCallPayload);
              void (async () => {
                try {
                  await acceptCall(callId);
                  useCallStore.getState().openCall({
                    callId: payload.callId,
                    conversationId: payload.conversationId,
                    peerId: payload.callerId,
                    peerName: payload.callerName,
                    peerAvatar: payload.callerAvatar ?? '',
                    callType: payload.callType,
                    isInitiator: false,
                    status: 'active',
                    callKind: 'direct',
                  });
                  void navigate(`/call/${callId}`);
                } catch (e) {
                  emitAppToast(e instanceof Error ? e.message : 'Не удалось принять звонок', 'error');
                } finally {
                  setIncomingCall(null);
                }
              })();
              return payload;
            });
          }),
        );

        handles.push(
          await NativeCall.addListener('declined', (ev) => {
            const callId = String(ev.callId ?? '');
            if (!callId) return;
            void declineCall(callId).catch(() => undefined);
            setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
          }),
        );

        handles.push(
          await NativeCall.addListener('ended', (ev) => {
            const callId = String(ev.callId ?? '');
            if (!callId) return;
            setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
          }),
        );
      } catch {
        setSuppressWebRingtone(false);
      }
    };

    void setup();

    return () => {
      cancelled = true;
      for (const h of handles) {
        void h.remove();
      }
    };
  }, [navigate]);

  const accept = async () => {
    if (!incomingCall) return;
    dismissIncomingCallBrowserNotification(incomingCall.callId);
    try {
      await acceptCall(incomingCall.callId);
      if (isCapacitorNative()) {
        void NativeCall.endCall({ callId: incomingCall.callId }).catch(() => undefined);
      }
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
    if (isCapacitorNative()) {
      void NativeCall.endCall({ callId: incomingCall.callId }).catch(() => undefined);
    }
    setIncomingCall(null);
  };

  return { incomingCall, accept, reject, suppressWebRingtone };
}
