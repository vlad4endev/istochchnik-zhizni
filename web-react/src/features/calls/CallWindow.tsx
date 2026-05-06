import { useCallback, useEffect, useRef, useState } from 'react';
import { LuMic, LuMicOff, LuMonitor, LuPhoneOff, LuVideo, LuVideoOff } from 'react-icons/lu';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

import { useCallStore, type ActiveCallState } from './callStore';
import { useWebRTC } from './useWebRTC';
import './calls.css';

function formatDuration(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function CallWindowInner({ activeCall }: { activeCall: ActiveCallState }) {
  const closeCall = useCallStore((s) => s.closeCall);
  const setStatus = useCallStore((s) => s.setStatus);
  const isMuted = useCallStore((s) => s.isMuted);
  const isVideoOff = useCallStore((s) => s.isVideoOff);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const isPeerVideoOff = useCallStore((s) => s.isPeerVideoOff);
  const isPeerMuted = useCallStore((s) => s.isPeerMuted);
  const setMuted = useCallStore((s) => s.setMuted);
  const setVideoOff = useCallStore((s) => s.setVideoOff);
  const setScreenSharing = useCallStore((s) => s.setScreenSharing);
  const setPeerVideoOff = useCallStore((s) => s.setPeerVideoOff);
  const setPeerMuted = useCallStore((s) => s.setPeerMuted);

  const [duration, setDuration] = useState(0);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const onCallEnded = useCallback(() => {
    closeCall();
  }, [closeCall]);

  const { start, toggleAudio, toggleVideo, startScreenShare, stopScreenShare, endCall, cleanupLocal, localStreamRef } =
    useWebRTC({
      callId: activeCall.callId,
      isInitiator: activeCall.isInitiator,
      callType: activeCall.callType,
      onRemoteStream: (stream) => {
        const el = remoteVideoRef.current;
        if (el) el.srcObject = stream;
        setStatus('active');
      },
      onCallEnded,
    });

  const { callId, isInitiator, callType } = activeCall;

  useEffect(() => {
    const attachLocal = () => {
      const stream = localStreamRef.current;
      if (callType === 'video' && localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
      }
    };

    if (!isInitiator) {
      void start().then(() => {
        attachLocal();
      });
      return;
    }

    const unsub = subscribeRealtimeMessages((raw) => {
      const m = raw as { type?: string; callId?: string };
      if (m.type === 'call:accepted' && m.callId === callId) {
        void start().then(() => {
          attachLocal();
        });
        unsub();
      }
    });
    return unsub;
  }, [callId, isInitiator, callType, start, localStreamRef]);

  useEffect(() => {
    if (activeCall.status !== 'active') return;
    const id = window.setInterval(() => setDuration((d) => d + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeCall.status]);

  useEffect(() => {
    const cid = activeCall.callId;
    const unsub = subscribeRealtimeMessages((raw) => {
      const m = raw as Record<string, unknown>;
      if (m.callId !== cid) return;
      switch (m.type) {
        case 'call:peer_video':
          setPeerVideoOff(!Boolean(m.enabled));
          break;
        case 'call:peer_audio':
          setPeerMuted(!Boolean(m.enabled));
          break;
        case 'call:peer_screen':
          break;
        case 'call:ended':
        case 'call:rejected':
        case 'call:error':
        case 'call:cancelled':
          cleanupLocal();
          closeCall();
          break;
        default:
          break;
      }
    });
    return unsub;
  }, [activeCall.callId, cleanupLocal, closeCall, setPeerMuted, setPeerVideoOff]);

  useEffect(() => {
    setDuration(0);
  }, [activeCall.callId]);

  const peerAvatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;

  const handleEnd = () => {
    endCall();
    closeCall();
  };

  const handleToggleAudio = () => {
    const nextMuted = !isMuted;
    toggleAudio(!nextMuted);
    setMuted(nextMuted);
  };

  const handleToggleVideo = () => {
    const nextOff = !isVideoOff;
    toggleVideo(!nextOff);
    setVideoOff(nextOff);
  };

  const handleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      setScreenSharing(false);
    } else {
      await startScreenShare();
      setScreenSharing(true);
    }
  };

  return (
    <div className="call-window">
      {activeCall.callType === 'video' ? (
        <div className="remote-video-wrap">
          <video ref={remoteVideoRef} autoPlay playsInline className="remote-video" />
          {isPeerVideoOff ? (
            <div className="video-off-overlay">
              {peerAvatarSrc ? (
                <img src={peerAvatarSrc} alt="" className="peer-avatar-large" />
              ) : (
                <div className="peer-avatar-large bg-stone-600" aria-hidden />
              )}
              <p>Камера выключена</p>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="audio-call-center">
          {peerAvatarSrc ? (
            <img src={peerAvatarSrc} alt="" className="peer-avatar-large" />
          ) : (
            <div className="peer-avatar-large bg-stone-600" aria-hidden />
          )}
          <p className="peer-name">{activeCall.peerName}</p>
          <p className="call-status">
            {activeCall.status === 'calling' ? 'Звоним…' : formatDuration(duration)}
          </p>
          {isPeerMuted ? <p className="mute-indicator">Собеседник выключил микрофон</p> : null}
        </div>
      )}

      {activeCall.callType === 'video' ? (
        <video ref={localVideoRef} autoPlay playsInline muted className="local-video" />
      ) : null}

      {activeCall.callType === 'video' ? (
        <div className="call-duration">
          {activeCall.status === 'active' ? formatDuration(duration) : 'Звоним…'}
        </div>
      ) : null}

      <div className="call-controls">
        <button
          type="button"
          className={['ctrl-btn', isMuted ? 'ctrl-btn--off' : ''].join(' ')}
          onClick={handleToggleAudio}
          title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {isMuted ? <LuMicOff size={22} strokeWidth={2.25} /> : <LuMic size={22} strokeWidth={2.25} />}
        </button>

        {activeCall.callType === 'video' ? (
          <>
            <button
              type="button"
              className={['ctrl-btn', isVideoOff ? 'ctrl-btn--off' : ''].join(' ')}
              onClick={handleToggleVideo}
              title={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
              aria-label={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
            >
              {isVideoOff ? (
                <LuVideoOff size={22} strokeWidth={2.25} />
              ) : (
                <LuVideo size={22} strokeWidth={2.25} />
              )}
            </button>
            <button
              type="button"
              className={['ctrl-btn', isScreenSharing ? 'ctrl-btn--active' : ''].join(' ')}
              onClick={() => void handleScreenShare()}
              title="Демонстрация экрана"
              aria-label="Демонстрация экрана"
            >
              <LuMonitor size={22} strokeWidth={2.25} />
            </button>
          </>
        ) : null}

        <button
          type="button"
          className="ctrl-btn ctrl-btn--end"
          onClick={handleEnd}
          title="Завершить звонок"
          aria-label="Завершить звонок"
        >
          <LuPhoneOff size={24} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

export function CallWindow() {
  const activeCall = useCallStore((s) => s.activeCall);
  if (!activeCall) return null;
  return <CallWindowInner key={activeCall.callId} activeCall={activeCall} />;
}
