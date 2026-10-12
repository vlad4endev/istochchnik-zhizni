import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useConnectionState,
} from '@livekit/components-react';
import {
  ConnectionState,
  DisconnectReason,
  Track,
  VideoPresets,
  type RoomOptions,
  type RoomConnectOptions,
} from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { startCallRing, stopCallRing, unlockCallAudio } from './callRingtone';
import { useCallStore, type ActiveCallState } from './callStore';
import './calls.css';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).host + new URL(url).pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
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
  const showScreenShare = !isMobileUa();

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
    if (!showScreenShare) {
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
  }, [isScreenSharing, localParticipant, setScreenSharing, showScreenShare]);

  return (
    <div className="call-controls">
      <button
        type="button"
        className={['call-ctrl-btn', isMuted ? 'call-ctrl-btn--off' : ''].join(' ')}
        onClick={() => void toggleMic()}
        aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
      >
        {isMuted ? <LuMicOff size={22} /> : <LuMic size={22} />}
      </button>
      {videoEnabled ? (
        <button
          type="button"
          className={['call-ctrl-btn', isVideoOff ? 'call-ctrl-btn--off' : ''].join(' ')}
          onClick={() => void toggleCam()}
          aria-label={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
        >
          {isVideoOff ? <LuVideoOff size={22} /> : <LuVideo size={22} />}
        </button>
      ) : null}
      {showScreenShare ? (
        <button
          type="button"
          className={['call-ctrl-btn', isScreenSharing ? 'call-ctrl-btn--active' : ''].join(' ')}
          onClick={() => void toggleScreen()}
          aria-label="Демонстрация экрана"
        >
          <LuMonitorUp size={22} />
        </button>
      ) : null}
      <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={onHangup} aria-label="Завершить">
        <LuPhoneOff size={22} />
      </button>
    </div>
  );
}

function RoomStage({
  callType,
  serverUrl,
  connectError,
}: {
  callType: 'audio' | 'video';
  serverUrl: string;
  connectError: string | null;
}) {
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
  const connected = connectionState === ConnectionState.Connected;

  useEffect(() => {
    if (!connected) {
      setElapsed(0);
      return;
    }
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [connected]);

  const remoteVideo = tracks.find(
    (t) =>
      !t.participant.isLocal &&
      t.publication?.kind === Track.Kind.Video &&
      t.publication?.isSubscribed,
  );
  const localVideo = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Camera && t.publication,
  );

  const avatarSrc = peerAvatar ? resolvePublicUrl(peerAvatar) : undefined;
  let statusLabel = 'Соединение…';
  if (connectError) statusLabel = connectError;
  else if (connectionState === ConnectionState.Connected) statusLabel = formatDuration(elapsed);
  else if (connectionState === ConnectionState.Connecting) statusLabel = 'Подключение к серверу…';
  else if (connectionState === ConnectionState.Reconnecting) {
    statusLabel = 'Переподключение…';
  } else if (connectionState === ConnectionState.Disconnected) {
    statusLabel = 'Нет соединения с сервером звонков';
  }

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
            <p className="call-stage__status">{statusLabel}</p>
            {!connected ? (
              <p className="call-stage__hint">Сервер: {hostLabel(serverUrl)}</p>
            ) : null}
          </div>
        )}
        {callType === 'video' && localVideo?.publication ? (
          <div className="call-stage__local-pip">
            <VideoTrack trackRef={localVideo} className="call-stage__local-video" />
          </div>
        ) : null}
      </div>
      {callType === 'video' && remoteVideo?.publication ? (
        <p className="call-stage__status call-stage__status--bar">{statusLabel}</p>
      ) : null}
      <RoomAudioRenderer />
    </div>
  );
}

function OutgoingRing({ activeCall, onCancel }: { activeCall: ActiveCallState; onCancel: () => void }) {
  const avatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;

  useEffect(() => {
    unlockCallAudio();
    const stop = startCallRing('ringback');
    return () => {
      stop();
      stopCallRing();
    };
  }, [activeCall.callId]);

  return (
    <div className="call-window call-window--ringing" role="dialog" aria-label="Исходящий звонок">
      <div className="call-stage">
        <div className="call-stage__main">
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
          </div>
        </div>
      </div>
      <div className="call-controls">
        <button
          type="button"
          className="call-ctrl-btn call-ctrl-btn--hangup"
          onClick={() => {
            stopCallRing();
            onCancel();
          }}
          aria-label="Отменить"
        >
          <LuPhoneOff size={22} />
        </button>
      </div>
    </div>
  );
}

function CallShell({
  children,
  onHangup,
  status,
}: {
  children: ReactNode;
  onHangup: () => void;
  status: string;
}) {
  return (
    <div className="call-window" role="dialog">
      <div className="call-stage">
        <div className="call-stage__main">
          <div className="call-stage__avatar-block">
            <p className="call-stage__status">{status}</p>
            {children}
          </div>
        </div>
      </div>
      <div className="call-controls">
        <button type="button" className="call-ctrl-btn call-ctrl-btn--hangup" onClick={onHangup} aria-label="Завершить">
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
  const [creds, setCreds] = useState<CallTokenResponse | null>(() =>
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
  const [connectError, setConnectError] = useState<string | null>(null);
  const [lkConnected, setLkConnected] = useState(false);
  const tokenInflight = useRef(false);
  /** Стабильные props для LiveKitRoom — смена JWT иначе делает leave/rejoin. */
  const roomTokenRef = useRef<string | null>(
    activeCall.livekitToken && activeCall.livekitUrl ? activeCall.livekitToken : null,
  );
  const roomUrlRef = useRef<string | null>(
    activeCall.livekitToken && activeCall.livekitUrl ? activeCall.livekitUrl : null,
  );

  const videoEnabled = activeCall.callType === 'video';
  const needsLiveKit =
    activeCall.status === 'active' ||
    (activeCall.callKind === 'group' && activeCall.status === 'calling');

  const hangup = useCallback(async () => {
    stopCallRing();
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
    if (activeCall.status === 'active' || activeCall.status === 'ended') {
      stopCallRing();
    }
  }, [activeCall.status]);

  useEffect(() => {
    return subscribeRealtimeMessages((raw) => {
      const m = raw as { type?: string; callId?: string; reason?: string; error?: string };
      if (String(m.callId ?? '') !== activeCall.callId) return;
      if (m.type === 'call:accepted') {
        setStatus('active');
      }
      if (m.type === 'call:error') {
        // Не закрывать активный звонок из‑за побочных WS-ошибок (иначе «пропал» звонок и чат).
        emitAppToast('Ошибка сигналинга звонка', 'error');
        return;
      }
      if (m.type === 'call:ended' || m.type === 'call:rejected' || m.type === 'call:cancelled') {
        if (m.type === 'call:rejected') emitAppToast('Звонок отклонён', 'info');
        if (m.type === 'call:cancelled') emitAppToast('Звонок отменён', 'info');
        if (m.type === 'call:ended' && m.reason === 'no_answer') {
          emitAppToast('Абонент не ответил', 'info');
        }
        closeCall();
      }
    });
  }, [activeCall.callId, closeCall, setStatus]);

  // Один запрос токена на звонок — без prefetch во время гудков (гонка → leave/rejoin).
  useEffect(() => {
    if (!needsLiveKit) return;
    if (roomTokenRef.current && roomUrlRef.current) {
      setCreds((prev) =>
        prev?.token
          ? prev
          : {
              token: roomTokenRef.current!,
              url: roomUrlRef.current!,
              identity: '',
              call: null as unknown as CallTokenResponse['call'],
            },
      );
      return;
    }
    if (tokenInflight.current) return;
    tokenInflight.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const t = await fetchCallToken(activeCall.callId);
        if (cancelled) return;
        // Зафиксировать первый успешный JWT — повторный setCreds ломает LiveKitRoom.
        if (roomTokenRef.current && roomUrlRef.current) return;
        roomTokenRef.current = t.token;
        roomUrlRef.current = t.url;
        setCreds(t);
        setLiveKitCreds(t.url, t.token);
        if (activeCall.status !== 'active') setStatus('active');
      } catch (e) {
        if (cancelled) return;
        setTokenError(e instanceof Error ? e.message : 'Ошибка подключения');
      } finally {
        tokenInflight.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCall.callId, activeCall.status, needsLiveKit, setLiveKitCreds, setStatus]);

  // Timeout if stuck connecting (signal WSS)
  useEffect(() => {
    if (!creds?.token || !creds.url || connectError || lkConnected) return;
    const t = window.setTimeout(() => {
      setConnectError(
        'Не удалось подключиться к серверу звонков. Проверьте LiveKit (WSS /lk и UDP-порты).',
      );
    }, 18_000);
    return () => window.clearTimeout(t);
  }, [creds?.token, creds?.url, connectError, lkConnected]);

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
      // Стабильность > качество: 540p, один слой (без тяжёлого simulcast).
      videoCaptureDefaults: {
        resolution: VideoPresets.h540.resolution,
        facingMode: 'user',
      },
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h216],
        videoCodec: 'vp8',
        stopMicTrackOnMute: true,
        dtx: true,
        red: true,
      },
    }),
    [],
  );

  const connectOptions = useMemo<RoomConnectOptions>(
    () => ({
      autoSubscribe: true,
      maxRetries: 8,
      peerConnectionTimeout: 30_000,
    }),
    [],
  );

  if (activeCall.status === 'calling' && activeCall.isInitiator && activeCall.callKind === 'direct') {
    return <OutgoingRing activeCall={activeCall} onCancel={() => void hangup()} />;
  }

  if (tokenError) {
    return (
      <CallShell onHangup={() => void hangup()} status={tokenError}>
        {null}
      </CallShell>
    );
  }

  const roomToken = roomTokenRef.current;
  const roomUrl = roomUrlRef.current;
  if (!roomToken || !roomUrl) {
    return (
      <CallShell onHangup={() => void hangup()} status="Получение доступа к комнате…">
        {null}
      </CallShell>
    );
  }

  return (
    <div className="call-window" role="dialog" aria-label="Активный звонок">
      <LiveKitRoom
        key={activeCall.callId}
        token={roomToken}
        serverUrl={roomUrl}
        connect
        audio
        video={videoEnabled}
        options={roomOptions}
        connectOptions={connectOptions}
        onError={(e) => {
          const msg = mapDeviceError(e);
          setConnectError(msg);
          emitAppToast(msg, 'error');
        }}
        onConnected={() => {
          setLkConnected(true);
          setConnectError(null);
        }}
        onDisconnected={(reason) => {
          setLkConnected(false);
          // Не закрывать звонок при кратком обрыве — LiveKit сам переподключится.
          if (
            reason === DisconnectReason.CLIENT_INITIATED ||
            reason === DisconnectReason.ROOM_DELETED ||
            reason === DisconnectReason.PARTICIPANT_REMOVED
          ) {
            return;
          }
        }}
        className="call-lk-room"
      >
        <RoomStage callType={activeCall.callType} serverUrl={roomUrl} connectError={connectError} />
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
