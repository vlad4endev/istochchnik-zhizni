import { useEffect, useRef } from 'react';

import { isCapacitorNative } from '../../lib/nativeApp';
import { NativeCall } from '../../plugins/nativeCall';

import { shouldHoldNativeOngoing } from './callBackgroundPolicy';
import { endCall as endCallApi } from './callsApi';
import { useCallStore } from './callStore';

/**
 * Keep LiveKit media alive when the phone locks / app backgrounds.
 *
 * Capacitor Android: microphone(+camera) foreground service + ongoing CallStyle.
 * Capacitor iOS: CallKit ongoing + AVAudioSession playAndRecord.
 * PWA / browser: not possible — OS suspends WebRTC under lock.
 */
export function useNativeOngoingCall(): void {
  const activeCall = useCallStore((s) => s.activeCall);
  const closeCall = useCallStore((s) => s.closeCall);
  const startedForRef = useRef<string | null>(null);
  const hangupInflight = useRef(false);

  useEffect(() => {
    if (!isCapacitorNative()) return;

    let cancelled = false;
    let hangupHandle: { remove: () => Promise<void> } | null = null;

    const attachHangup = async () => {
      try {
        const { supported } = await NativeCall.isSupported();
        if (!supported || cancelled) return;
        hangupHandle = await NativeCall.addListener('hangupRequested', (ev) => {
          const callId = String(ev?.callId ?? '').trim();
          if (!callId) return;
          const current = useCallStore.getState().activeCall;
          if (!current || current.callId !== callId) return;
          if (hangupInflight.current) return;
          hangupInflight.current = true;
          void (async () => {
            try {
              await endCallApi(callId);
            } catch {
              /* ignore — still close local UI */
            } finally {
              try {
                await NativeCall.stopOngoing?.({ callId });
              } catch {
                /* ignore */
              }
              try {
                await NativeCall.endCall({ callId });
              } catch {
                /* ignore */
              }
              closeCall();
              hangupInflight.current = false;
            }
          })();
        });
      } catch {
        /* plugin missing on web stub */
      }
    };

    void attachHangup();
    return () => {
      cancelled = true;
      void hangupHandle?.remove();
    };
  }, [closeCall]);

  useEffect(() => {
    if (!isCapacitorNative()) return;

    const call = activeCall;
    const shouldHold = Boolean(call?.callId) && shouldHoldNativeOngoing(call?.status);

    if (!shouldHold) {
      const prev = startedForRef.current;
      startedForRef.current = null;
      if (prev) {
        void NativeCall.stopOngoing?.({ callId: prev }).catch(() => undefined);
      }
      return;
    }

    const callId = call!.callId;
    if (startedForRef.current === callId) return;
    startedForRef.current = callId;

    void NativeCall.startOngoing?.({
      callId,
      peerName: call!.peerName || (call!.callKind === 'group' ? 'Встреча' : 'Собеседник'),
      callType: call!.callType,
      callKind: call!.callKind,
      hasVideo: call!.callType === 'video' && !useCallStore.getState().isVideoOff,
    }).catch(() => {
      // Older native builds without startOngoing — ignore.
      if (startedForRef.current === callId) startedForRef.current = null;
    });

    return () => {
      /* stop is handled by the !shouldHold branch or unmount below */
    };
  }, [activeCall?.callId, activeCall?.status, activeCall?.callType, activeCall?.callKind, activeCall?.peerName]);

  useEffect(() => {
    return () => {
      const prev = startedForRef.current;
      startedForRef.current = null;
      if (prev && isCapacitorNative()) {
        void NativeCall.stopOngoing?.({ callId: prev }).catch(() => undefined);
      }
    };
  }, []);
}
