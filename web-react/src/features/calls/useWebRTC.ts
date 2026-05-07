import SimplePeer from 'simple-peer';
import { useCallback, useEffect, useRef } from 'react';

import { sendRealtimeJson, subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let cachedIceServers: RTCIceServer[] | null = null;
let cachedIceServersAt = 0;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (cachedIceServers && now - cachedIceServersAt < 60 * 60 * 1000) {
    return cachedIceServers;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('/api/calls/ice-servers', {
      credentials: 'include',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('Failed to fetch ICE servers');
    const data = (await res.json()) as { iceServers?: unknown };
    const iceServers = Array.isArray(data.iceServers)
      ? (data.iceServers as RTCIceServer[])
      : FALLBACK_ICE_SERVERS;
    cachedIceServers = iceServers.length > 0 ? iceServers : FALLBACK_ICE_SERVERS;
    cachedIceServersAt = Date.now();
    return cachedIceServers;
  } catch {
    return FALLBACK_ICE_SERVERS;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export interface UseWebRTCOptions {
  callId: string;
  isInitiator: boolean;
  callType: 'audio' | 'video';
  onRemoteStream: (stream: MediaStream) => void;
  onCallEnded: () => void;
  onIceStateChange?: (state: RTCIceConnectionState) => void;
}

export function useWebRTC({
  callId,
  isInitiator,
  callType,
  onRemoteStream,
  onCallEnded,
  onIceStateChange,
}: UseWebRTCOptions) {
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceListenerCleanupRef = useRef<(() => void) | null>(null);
  const pendingSignalsRef = useRef<unknown[]>([]);
  const startedRef = useRef(false);
  const onRemoteStreamRef = useRef(onRemoteStream);
  onRemoteStreamRef.current = onRemoteStream;
  const onCallEndedRef = useRef(onCallEnded);
  onCallEndedRef.current = onCallEnded;
  const onIceStateChangeRef = useRef(onIceStateChange);
  onIceStateChangeRef.current = onIceStateChange;

  const flushPending = useCallback((peer: SimplePeer.Instance) => {
    const q = pendingSignalsRef.current;
    pendingSignalsRef.current = [];
    for (const data of q) {
      try {
        peer.signal(data as Parameters<SimplePeer.Instance['signal']>[0]);
      } catch {
        /* ignore malformed */
      }
    }
  }, []);

  const cleanupLocal = useCallback(() => {
    try {
      iceListenerCleanupRef.current?.();
    } catch {
      /* ignore */
    }
    iceListenerCleanupRef.current = null;
    try {
      peerRef.current?.destroy();
    } catch {
      /* ignore */
    }
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    startedRef.current = false;
    pendingSignalsRef.current = [];
  }, []);

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const originalTrack = localStreamRef.current?.getVideoTracks()[0];
    const pc = (peerRef.current as unknown as { _pc?: RTCPeerConnection })?._pc;
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
    if (originalTrack) await sender?.replaceTrack(originalTrack);
    sendRealtimeJson({ type: 'call:screen_share', callId, enabled: false });
  }, [callId]);

  const start = useCallback(async (): Promise<MediaStream | null> => {
    if (!callId || startedRef.current) return null;
    startedRef.current = true;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video' ? { width: 1280, height: 720 } : false,
      });
      localStreamRef.current = stream;

      const iceServers = await fetchIceServers();
      const peer = new SimplePeer({
        initiator: isInitiator,
        stream,
        trickle: true,
        config: {
          iceServers,
          iceCandidatePoolSize: 10,
        },
      });

      peer.on('signal', (data: Parameters<SimplePeer.Instance['signal']>[0]) => {
        sendRealtimeJson({ type: 'call:signal', callId, data });
      });

      peer.on('stream', (remote: MediaStream) => {
        onRemoteStreamRef.current?.(remote);
      });

      peer.on('close', () => {
        onCallEndedRef.current?.();
      });

      peer.on('error', (err: Error) => {
        console.error('[webrtc]', err);
      });

      const pc = (peer as unknown as { _pc?: RTCPeerConnection })._pc;
      if (pc) {
        const emitState = () => {
          onIceStateChangeRef.current?.(pc.iceConnectionState);
        };
        pc.addEventListener('iceconnectionstatechange', emitState);
        iceListenerCleanupRef.current = () => {
          pc.removeEventListener('iceconnectionstatechange', emitState);
        };
        emitState();
      }

      peerRef.current = peer;
      flushPending(peer);
      return stream;
    } catch (error) {
      startedRef.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      throw error;
    }
  }, [callId, isInitiator, callType, flushPending]);

  useEffect(() => {
    if (!callId) return;
    const unsub = subscribeRealtimeMessages((raw) => {
      const msg = raw as { type?: string; callId?: string; data?: unknown };
      if (msg.type !== 'call:signal' || msg.callId !== callId || msg.data == null) return;
      const peer = peerRef.current;
      if (peer) {
        try {
          peer.signal(msg.data as Parameters<SimplePeer.Instance['signal']>[0]);
        } catch {
          /* ignore */
        }
      } else {
        pendingSignalsRef.current.push(msg.data);
      }
    });
    return unsub;
  }, [callId]);

  useEffect(
    () => () => {
      cleanupLocal();
    },
    [callId, cleanupLocal],
  );

  const toggleVideo = useCallback(
    (enabled: boolean) => {
      localStreamRef.current?.getVideoTracks().forEach((t) => {
        t.enabled = enabled;
      });
      sendRealtimeJson({ type: 'call:toggle_video', callId, enabled });
    },
    [callId],
  );

  const toggleAudio = useCallback(
    (enabled: boolean) => {
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
      sendRealtimeJson({ type: 'call:toggle_audio', callId, enabled });
    },
    [callId],
  );

  const startScreenShare = useCallback(async () => {
    const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenStreamRef.current = screen;
    const track = screen.getVideoTracks()[0];
    const pc = (peerRef.current as unknown as { _pc?: RTCPeerConnection })?._pc;
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video');
    await sender?.replaceTrack(track);
    sendRealtimeJson({ type: 'call:screen_share', callId, enabled: true });
    track.onended = () => {
      void stopScreenShare();
    };
  }, [callId, stopScreenShare]);

  const endCall = useCallback(() => {
    cleanupLocal();
    sendRealtimeJson({ type: 'call:end', callId });
  }, [callId, cleanupLocal]);

  return {
    localStreamRef,
    start,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    endCall,
    cleanupLocal,
  };
}
