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
    const applyIncoming = (
      raw: {
        callId?: string;
        callerId?: number | string;
        conversationId?: string;
        callType?: string;
        callerName?: string;
        callerAvatar?: string | null;
      },
      source: 'ws' | 'push' | 'native',
    ) => {
      const next = normalizeIncoming(raw);
      if (!next.callId) return;
      setIncomingCall(next);
      if (source === 'native') {
        // CallKit / CallStyle уже звонят — не дублируем
        setSuppressWebRingtone(true);
      } else {
        // WS/FCM: включаем рингтон, но не сбрасываем suppress, если натив уже показал UI
        setSuppressWebRingtone((prev) => prev);
      }
      if (!isCapacitorNative()) {
        notifyIncomingCallBackground({
          callId: next.callId,
          callerName: next.callerName,
          callType: next.callType,
          callerAvatar: next.callerAvatar,
        });
      }
    };

    const clearIncoming = (callId: string) => {
      if (!callId) return;
      dismissIncomingCallBrowserNotification(callId);
      setIncomingCall((cur) => (cur && cur.callId === callId ? null : cur));
      setSuppressWebRingtone(false);
      if (isCapacitorNative()) {
        void NativeCall.endCall({ callId }).catch(() => undefined);
      }
    };

    const unsubWs = subscribeRealtimeMessages((raw) => {
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
        applyIncoming(m, 'ws');
        return;
      }
      if (m.type === 'call:cancelled' || m.type === 'call:ended' || m.type === 'call:rejected') {
        clearIncoming(String(m.callId ?? ''));
      }
    });

    // FCM data-only в foreground (и tap по пушу) — если WS ещё не доставил call:incoming
    const onPushIncoming = (ev: Event) => {
      const detail = (ev as CustomEvent<Record<string, unknown>>).detail ?? {};
      applyIncoming(
        {
          callId: typeof detail.callId === 'string' ? detail.callId : undefined,
          callerId: detail.callerId as number | string | undefined,
          conversationId: typeof detail.conversationId === 'string' ? detail.conversationId : undefined,
          callType: typeof detail.callType === 'string' ? detail.callType : undefined,
          callerName: typeof detail.callerName === 'string' ? detail.callerName : undefined,
          callerAvatar:
            detail.callerAvatar == null
              ? null
              : typeof detail.callerAvatar === 'string'
                ? detail.callerAvatar
                : null,
        },
        'push',
      );
    };
    const onPushEnded = (ev: Event) => {
      const callId = String((ev as CustomEvent<{ callId?: string }>).detail?.callId ?? '');
      clearIncoming(callId);
    };
    window.addEventListener('calls:push-incoming', onPushIncoming);
    window.addEventListener('calls:push-call-ended', onPushEnded);

    return () => {
      unsubWs();
      window.removeEventListener('calls:push-incoming', onPushIncoming);
      window.removeEventListener('calls:push-call-ended', onPushEnded);
    };
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
