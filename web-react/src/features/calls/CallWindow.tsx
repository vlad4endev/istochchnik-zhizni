import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useConnectionState,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuMic, LuMicOff, LuMonitorUp, LuPhoneOff, LuVideo, LuVideoOff } from 'react-icons/lu';

import { emitAppToast } from '../../lib/uiFeedback';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

import {
  cancelCall,
  endCall,
  fetchCallToken,
  mapDeviceError,
  type CallTokenResponse,
} from './callsApi';
import { useCallStore, type ActiveCallState } from './callStore';
import './calls.css';
import '@livekit/components-styles';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function CallControls({
  videoEnabled,
  onHangup,
}: {
  videoEnabled: boolean;
  onHangup: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const isMuted = useCallStore((s) => s.isMuted);
  const isVideoOff = useCallStore((s) => s.isVideoOff);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const setMuted = useCallStore((s) => s.setMuted);
  const setVideoOff = useCallStore((s) => s.setVideoOff);
  const setScreenSharing = useCallStore((s) => s.setScreenSharing);

  const toggleMic = useCallback(async () => {
    try {
      const next = !isMuted;
      await localParticipant.setMicrophoneEnabled(!next);
      setMuted(next);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    }
  }, [isMuted, localParticipant, setMuted]);

  const toggleCam = useCallback(async () => {
    if (!videoEnabled) return;
    try {
      const next = !isVideoOff;
      await localParticipant.setCameraEnabled(!next);
      setVideoOff(next);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    }
  }, [isVideoOff, localParticipant, setVideoOff, videoEnabled]);

  const toggleScreen = useCallback(async () => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      emitAppToast('Демонстрация экрана недоступна на этом устройстве', 'info');
      return;
    }
    try {
      if (isScreenSharing) {
        await localParticipant.setScreenShareEnabled(false);
        setScreenSharing(false);
      } else {
        await localParticipant.setScreenShareEnabled(true);
        setScreenSharing(true);
      }
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
      setScreenSharing(false);
    }
  }, [isScreenSharing, localParticipant, setScreenSharing]);

  return (
    <div className="call-controls">
      <button type="button" className="call-ctrl-btn" onClick={() => void toggleMic()} aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}>
        {isMuted ? <LuMicOff size={22} /> : <LuMic size={22} />}
      </button>
      {videoEnabled ? (
        <button type="button" className="call-ctrl-btn" onClick={() => void toggleCam()} aria-label={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}>
          {isVideoOff ? <LuVideoOff size={22} /> : <LuVideo size={22} />}
        </button>
      ) : null}
      <button type="button" className="call-ctrl-btn" onClick={() => void toggleScreen()} aria-label="Демонстрация экрана">
        <LuMonitorUp size={22} />
      </button>
      <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={onHangup} aria-label="Завершить">
        <LuPhoneOff size={22} />
      </button>
    </div>
  );
}

function RoomStage({ callType }: { callType: 'audio' | 'video' }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const connectionState = useConnectionState();
  const peerName = useCallStore((s) => s.activeCall?.peerName ?? 'Собеседник');
  const peerAvatar = useCallStore((s) => s.activeCall?.peerAvatar ?? '');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const remoteVideo = tracks.find(
    (t) => !t.participant.isLocal && t.publication?.kind === Track.Kind.Video && t.publication?.isSubscribed,
  );
  const localVideo = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera && t.publication,
  );

  const avatarSrc = peerAvatar ? resolvePublicUrl(peerAvatar) : undefined;
  const statusLabel =
    connectionState === ConnectionState.Connected
      ? formatDuration(elapsed)
      : connectionState === ConnectionState.Connecting
        ? 'Подключение…'
        : connectionState === ConnectionState.Reconnecting
          ? 'Переподключение…'
          : 'Соединение…';

  return (
    <div className="call-stage">
      <div className="call-stage__main">
        {callType === 'video' && remoteVideo?.publication ? (
          <VideoTrack trackRef={remoteVideo} className="call-stage__remote-video" />
        ) : (
          <div className="call-stage__avatar-block">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="call-stage__avatar" />
            ) : (
              <div className="call-stage__avatar call-stage__avatar--placeholder" aria-hidden />
            )}
            <p className="call-stage__name">{peerName}</p>
          </div>
        )}
        {callType === 'video' && localVideo?.publication ? (
          <div className="call-stage__local-pip">
            <VideoTrack trackRef={localVideo} className="call-stage__local-video" />
          </div>
        ) : null}
      </div>
      <p className="call-stage__status">{statusLabel}</p>
      <RoomAudioRenderer />
    </div>
  );
}

function OutgoingRing({ activeCall, onCancel }: { activeCall: ActiveCallState; onCancel: () => void }) {
  const avatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;
  return (
    <div className="call-window call-window--ringing" role="dialog" aria-label="Исходящий звонок">
      <div className="call-stage__avatar-block">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="call-stage__avatar" />
        ) : (
          <div className="call-stage__avatar call-stage__avatar--placeholder" aria-hidden />
        )}
        <p className="call-stage__name">{activeCall.peerName}</p>
        <p className="call-stage__status">
          {activeCall.callType === 'video' ? 'Видеозвонок…' : 'Вызов…'}
        </p>
      </div>
      {activeCall.inviteUrl ? (
        <button
          type="button"
          className="call-invite-copy"
          onClick={() => {
            void navigator.clipboard.writeText(activeCall.inviteUrl!).then(
              () => emitAppToast('Ссылка скопирована', 'success'),
              () => emitAppToast('Не удалось скопировать ссылку', 'error'),
            );
          }}
        >
          Скопировать ссылку-приглашение
        </button>
      ) : null}
      <div className="call-controls">
        <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={onCancel} aria-label="Отменить">
          <LuPhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}

function CallWindowInner({ activeCall }: { activeCall: ActiveCallState }) {
  const closeCall = useCallStore((s) => s.closeCall);
  const setStatus = useCallStore((s) => s.setStatus);
  const setLiveKitCreds = useCallStore((s) => s.setLiveKitCreds);
  const [creds, setCreds] = useState<CallTokenResponse | null>(
    activeCall.livekitToken && activeCall.livekitUrl
      ? {
          token: activeCall.livekitToken,
          url: activeCall.livekitUrl,
          identity: '',
          call: null as unknown as CallTokenResponse['call'],
        }
      : null,
  );
  const [tokenError, setTokenError] = useState<string | null>(null);

  const videoEnabled = activeCall.callType === 'video';

  const hangup = useCallback(async () => {
    try {
      if (activeCall.status === 'calling' && activeCall.isInitiator) {
        await cancelCall(activeCall.callId);
      } else {
        await endCall(activeCall.callId);
      }
    } catch {
      /* ignore */
    }
    closeCall();
  }, [activeCall.callId, activeCall.isInitiator, activeCall.status, closeCall]);

  useEffect(() => {
    return subscribeRealtimeMessages((raw) => {
      const m = raw as { type?: string; callId?: string; reason?: string };
      if (String(m.callId ?? '') !== activeCall.callId) return;
      if (m.type === 'call:accepted') {
        setStatus('active');
      }
      if (
        m.type === 'call:ended' ||
        m.type === 'call:rejected' ||
        m.type === 'call:cancelled' ||
        m.type === 'call:error'
      ) {
        if (m.type === 'call:rejected') emitAppToast('Звонок отклонён', 'info');
        if (m.type === 'call:cancelled') emitAppToast('Звонок отменён', 'info');
        if (m.type === 'call:ended' && m.reason === 'no_answer') {
          emitAppToast('Абонент не ответил', 'info');
        }
        closeCall();
      }
    });
  }, [activeCall.callId, closeCall, setStatus]);

  useEffect(() => {
    if (activeCall.status !== 'active' && !(activeCall.callKind === 'group' && activeCall.status === 'calling')) {
      return;
    }
    if (creds?.token) return;
    let cancelled = false;
    void (async () => {
      try {
        const t = await fetchCallToken(activeCall.callId);
        if (cancelled) return;
        setCreds(t);
        setLiveKitCreds(t.url, t.token);
        setStatus('active');
      } catch (e) {
        if (cancelled) return;
        setTokenError(e instanceof Error ? e.message : 'Ошибка подключения');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCall.callId, activeCall.callKind, activeCall.status, creds?.token, setLiveKitCreds, setStatus]);

  // Initiator of direct call: fetch token early so room is ready when accepted
  useEffect(() => {
    if (activeCall.callKind !== 'direct' || !activeCall.isInitiator || activeCall.status !== 'calling') {
      return;
    }
    if (creds?.token) return;
    let cancelled = false;
    void (async () => {
      try {
        const t = await fetchCallToken(activeCall.callId);
        if (cancelled) return;
        setCreds(t);
        setLiveKitCreds(t.url, t.token);
      } catch {
        /* token on accept is enough */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCall.callId, activeCall.callKind, activeCall.isInitiator, activeCall.status, creds?.token, setLiveKitCreds]);

  const roomOptions = useMemo(
    () => ({
      adaptiveStream: true,
      dynacast: true,
    }),
    [],
  );

  if (activeCall.status === 'calling' && activeCall.isInitiator && activeCall.callKind === 'direct') {
    return <OutgoingRing activeCall={activeCall} onCancel={() => void hangup()} />;
  }

  if (tokenError) {
    return (
      <div className="call-window" role="dialog">
        <p className="call-stage__status">{tokenError}</p>
        <div className="call-controls">
          <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={() => void hangup()}>
            <LuPhoneOff size={22} />
          </button>
        </div>
      </div>
    );
  }

  if (!creds?.token || !creds.url) {
    return (
      <div className="call-window" role="dialog">
        <p className="call-stage__status">Подключение к комнате…</p>
        <div className="call-controls">
          <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={() => void hangup()}>
            <LuPhoneOff size={22} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-window" role="dialog" aria-label="Активный звонок">
      <LiveKitRoom
        token={creds.token}
        serverUrl={creds.url}
        connect
        audio
        video={videoEnabled}
        options={roomOptions}
        onError={(e) => emitAppToast(mapDeviceError(e), 'error')}
        onDisconnected={() => {
          /* hangup via button preferred; avoid auto-end on brief blips */
        }}
        data-lk-theme="default"
        style={{ height: '100%', width: '100%' }}
      >
        <RoomStage callType={activeCall.callType} />
        <CallControls videoEnabled={videoEnabled} onHangup={() => void hangup()} />
      </LiveKitRoom>
    </div>
  );
}

export function CallWindow() {
  const activeCall = useCallStore((s) => s.activeCall);
  if (!activeCall) return null;
  return <CallWindowInner key={activeCall.callId} activeCall={activeCall} />;
}
