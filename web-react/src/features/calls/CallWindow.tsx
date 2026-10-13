import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  isTrackReference,
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useConnectionState,
  useRoomContext,
  useParticipants,
  useRemoteParticipants,
} from '@livekit/components-react';
import {
  ConnectionState,
  DisconnectReason,
  Track,
  VideoPresets,
  type Participant,
  type Room,
  type RoomOptions,
  type RoomConnectOptions,
} from 'livekit-client';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  LuCopy,
  LuMic,
  LuMicOff,
  LuMonitorUp,
  LuPhoneOff,
  LuShare2,
  LuVideo,
  LuVideoOff,
  LuX,
} from 'react-icons/lu';

import { emitAppToast } from '../../lib/uiFeedback';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';

import {
  cancelCall,
  createCallInvitation,
  endCall,
  fetchCallToken,
  mapDeviceError,
  type CallTokenResponse,
} from './callsApi';
import { startCallRing, stopCallRing, unlockCallAudio } from './callRingtone';
import { MeetingAvatar } from './MeetingAvatar';
import { useCallStore, type ActiveCallState } from './callStore';
import './calls.css';

function absoluteInviteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  try {
    return new URL(trimmed, window.location.origin).toString();
  } catch {
    return trimmed;
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/** Разблокировать WebAudio + LiveKit HTMLMediaElement playback (autoplay policy). */
function resumeCallMedia(room?: Room | null): void {
  unlockCallAudio();
  if (!room) return;
  void room.startAudio().catch(() => undefined);
}

function participantDisplayName(p: Participant): string {
  const name = String(p.name || '').trim();
  if (name) return name;
  const id = String(p.identity || '').replace(/^member:/, '');
  return id ? `Участник ${id}` : 'Участник';
}

function participantAvatarUrl(p: Participant): string | undefined {
  const raw = String(p.metadata || '').trim();
  if (!raw) return undefined;
  try {
    const meta = JSON.parse(raw) as { avatarUrl?: unknown };
    const path = typeof meta.avatarUrl === 'string' ? meta.avatarUrl.trim() : '';
    if (!path) return undefined;
    return resolvePublicUrl(path) || undefined;
  } catch {
    return undefined;
  }
}

function participantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function CallControls({
  videoEnabled,
  onHangup,
  canShare = false,
  shareOpen = false,
  onToggleShare,
}: {
  videoEnabled: boolean;
  onHangup: () => void;
  canShare?: boolean;
  shareOpen?: boolean;
  onToggleShare?: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const setMuted = useCallStore((s) => s.setMuted);
  const setVideoOff = useCallStore((s) => s.setVideoOff);
  const setScreenSharing = useCallStore((s) => s.setScreenSharing);
  const showScreenShare = !isMobileUa();

  // Источник истины — LiveKit participant, не zustand (иначе рассинхрон после mute).
  const isMuted = !isMicrophoneEnabled;
  const isVideoOff = videoEnabled ? !isCameraEnabled : true;
  const isScreenSharing = Boolean(isScreenShareEnabled);

  useEffect(() => {
    setMuted(isMuted);
  }, [isMuted, setMuted]);
  useEffect(() => {
    if (videoEnabled) setVideoOff(isVideoOff);
  }, [isVideoOff, setVideoOff, videoEnabled]);
  useEffect(() => {
    setScreenSharing(isScreenSharing);
  }, [isScreenSharing, setScreenSharing]);

  const toggleMic = useCallback(async () => {
    try {
      resumeCallMedia(room);
      await localParticipant.setMicrophoneEnabled(isMuted);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    }
  }, [isMuted, localParticipant, room]);

  const toggleCam = useCallback(async () => {
    if (!videoEnabled) return;
    try {
      resumeCallMedia(room);
      await localParticipant.setCameraEnabled(isVideoOff);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    }
  }, [isVideoOff, localParticipant, room, videoEnabled]);

  const toggleScreen = useCallback(async () => {
    if (!showScreenShare) {
      emitAppToast('Демонстрация экрана недоступна на этом устройстве', 'info');
      return;
    }
    try {
      resumeCallMedia(room);
      await localParticipant.setScreenShareEnabled(!isScreenSharing);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    }
  }, [isScreenSharing, localParticipant, room, showScreenShare]);

  return (
    <div className="call-controls">
      {canShare ? (
        <button
          type="button"
          className={['call-ctrl-btn', shareOpen ? 'call-ctrl-btn--active' : ''].join(' ')}
          onClick={() => onToggleShare?.()}
          aria-label={shareOpen ? 'Скрыть ссылку' : 'Поделиться ссылкой'}
          aria-pressed={shareOpen}
        >
          <LuShare2 size={22} />
        </button>
      ) : null}
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

function MeetingParticipantTile({
  participant,
  callType,
  cameraTrack,
}: {
  participant: Participant;
  callType: 'audio' | 'video';
  cameraTrack: ReturnType<typeof useTracks>[number] | null;
}) {
  const name = participantDisplayName(participant);
  const avatarSrc = participantAvatarUrl(participant);
  const showVideo =
    callType === 'video' &&
    Boolean(cameraTrack && isTrackReference(cameraTrack) && cameraTrack.publication?.track);
  const speaking = Boolean(participant.isSpeaking);

  return (
    <div
      className={[
        'call-participant-tile',
        callType === 'audio' ? 'call-participant-tile--audio' : 'call-participant-tile--video',
        speaking ? 'call-participant-tile--speaking' : '',
        participant.isLocal ? 'call-participant-tile--local' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="call-participant-tile__media">
        {showVideo && cameraTrack && isTrackReference(cameraTrack) ? (
          <VideoTrack
            trackRef={cameraTrack}
            className="call-participant-tile__video"
            manageSubscription={false}
            playsInline
            autoPlay
          />
        ) : avatarSrc ? (
          <img src={avatarSrc} alt="" className="call-participant-tile__avatar-img" />
        ) : (
          <div className="call-participant-tile__initials" aria-hidden>
            {participantInitials(name)}
          </div>
        )}
      </div>
      <p className="call-participant-tile__name">
        {participant.isLocal ? `${name} (вы)` : name}
      </p>
    </div>
  );
}

function RoomStage({
  callType,
  connectError,
}: {
  callType: 'audio' | 'video';
  connectError: string | null;
}) {
  const room = useRoomContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const participants = useParticipants();
  const remotes = useRemoteParticipants();
  const connectionState = useConnectionState();
  const { isCameraEnabled } = useLocalParticipant();
  const peerName = useCallStore((s) => s.activeCall?.peerName ?? 'Собеседник');
  const peerAvatar = useCallStore((s) => s.activeCall?.peerAvatar ?? '');
  const callKind = useCallStore((s) => s.activeCall?.callKind ?? 'direct');
  const [elapsed, setElapsed] = useState(0);
  const connected = connectionState === ConnectionState.Connected;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const isGroup = callKind === 'group';

  useEffect(() => {
    if (!connected) {
      setElapsed(0);
      return;
    }
    resumeCallMedia(room);
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [connected, room]);

  // После attach трека Safari/Chrome иногда не стартуют video.play без явного вызова.
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const kick = () => {
      root.querySelectorAll('video').forEach((el) => {
        if (el.paused) void el.play().catch(() => undefined);
      });
    };
    kick();
    const t = window.setInterval(kick, 1500);
    return () => window.clearInterval(t);
  }, [connected, tracks.length, participants.length]);

  const remoteScreen = tracks.find(
    (t) =>
      !t.participant.isLocal &&
      t.source === Track.Source.ScreenShare &&
      t.publication?.track,
  );
  const remoteCam = tracks.find(
    (t) =>
      !t.participant.isLocal &&
      t.source === Track.Source.Camera &&
      t.publication?.track,
  );
  // Не фильтровать local по isMuted — иначе mute mic/cam размонтирует <video> и мигает картинка.
  const localCam = tracks.find(
    (t) =>
      t.participant.isLocal &&
      t.source === Track.Source.Camera &&
      t.publication?.track,
  );

  const remoteVideo =
    remoteScreen && isTrackReference(remoteScreen)
      ? remoteScreen
      : remoteCam && isTrackReference(remoteCam)
        ? remoteCam
        : null;
  const localVideo = localCam && isTrackReference(localCam) ? localCam : null;
  const showRemoteVideo =
    !isGroup && callType === 'video' && Boolean(remoteVideo?.publication?.track);
  const showLocalPip = !isGroup && callType === 'video' && Boolean(localVideo) && isCameraEnabled;

  const avatarSrc = peerAvatar ? resolvePublicUrl(peerAvatar) : undefined;
  let statusLabel = 'Соединение…';
  if (connectError) statusLabel = connectError;
  else if (connectionState === ConnectionState.Connected) statusLabel = formatDuration(elapsed);
  else if (connectionState === ConnectionState.Connecting) statusLabel = 'Подключение к серверу…';
  else if (connectionState === ConnectionState.Reconnecting) {
    statusLabel = 'Переподключение…';
  } else if (connectionState === ConnectionState.Disconnected) {
    statusLabel = 'Ошибка сервера или идут технические работы';
  }

  const cameraByIdentity = useMemo(() => {
    const map = new Map<string, (typeof tracks)[number]>();
    for (const t of tracks) {
      if (t.source !== Track.Source.Camera || !t.publication?.track) continue;
      map.set(t.participant.identity, t);
    }
    return map;
  }, [tracks]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? 1 : -1;
      return participantDisplayName(a).localeCompare(participantDisplayName(b), 'ru');
    });
  }, [participants]);

  const waitingAlone = isGroup && remotes.length === 0;

  return (
    <div className="call-stage" ref={stageRef}>
      <div className="call-stage__main">
        {isGroup ? (
          waitingAlone ? (
            <div className="call-stage__avatar-block">
              <MeetingAvatar mediaType={callType} size="lg" />
              <p className="call-stage__name">Встреча</p>
              <p className="call-stage__status">
                {connectError || (connected ? 'Ожидание участников…' : statusLabel)}
              </p>
            </div>
          ) : (
            <div
              className={[
                'call-participants',
                callType === 'audio' ? 'call-participants--audio' : 'call-participants--video',
                sortedParticipants.length <= 2
                  ? 'call-participants--few'
                  : sortedParticipants.length <= 4
                    ? 'call-participants--mid'
                    : 'call-participants--many',
              ].join(' ')}
              aria-label="Участники встречи"
            >
              {sortedParticipants.map((p) => (
                <MeetingParticipantTile
                  key={p.identity || p.sid}
                  participant={p}
                  callType={callType}
                  cameraTrack={cameraByIdentity.get(p.identity) ?? null}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {showRemoteVideo && remoteVideo ? (
              <VideoTrack
                trackRef={remoteVideo}
                className="call-stage__remote-video"
                manageSubscription={false}
                playsInline
                autoPlay
              />
            ) : null}
            {!showRemoteVideo ? (
              <div className="call-stage__avatar-block">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" className="call-stage__avatar" />
                ) : !peerAvatar ? (
                  <MeetingAvatar mediaType={callType} size="lg" />
                ) : (
                  <div className="call-stage__avatar call-stage__avatar--placeholder" aria-hidden />
                )}
                <p className="call-stage__name">{peerName}</p>
                <p className="call-stage__status">{statusLabel}</p>
              </div>
            ) : null}
            {localVideo ? (
              <div
                className="call-stage__local-pip"
                style={showLocalPip ? undefined : { visibility: 'hidden', pointerEvents: 'none' }}
                aria-hidden={!showLocalPip}
              >
                <VideoTrack
                  trackRef={localVideo}
                  className="call-stage__local-video"
                  manageSubscription={false}
                  playsInline
                  autoPlay
                />
              </div>
            ) : null}
          </>
        )}
      </div>
      {isGroup && !waitingAlone ? (
        <p className="call-stage__status call-stage__status--bar">
          {connectError || `${statusLabel} · ${sortedParticipants.length}`}
        </p>
      ) : null}
      {!isGroup && showRemoteVideo ? (
        <p className="call-stage__status call-stage__status--bar">{statusLabel}</p>
      ) : null}
      <RoomAudioRenderer />
      <StartAudio label="Нажмите, чтобы включить звук" className="call-start-audio" />
    </div>
  );
}

/** Панель ссылки: на старте раскрыта, после подключения участников — сворачивается. */
function MeetingInviteBar({ callId, onCollapse }: { callId: string; onCollapse: () => void }) {
  const inviteUrl = useCallStore((s) => s.activeCall?.inviteUrl ?? null);
  const setInviteUrl = useCallStore((s) => s.setInviteUrl);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (inviteUrl) return;
    let cancelled = false;
    setBusy(true);
    void createCallInvitation(callId)
      .then((inv) => {
        if (!cancelled) setInviteUrl(inv.inviteUrl);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [callId, inviteUrl, setInviteUrl]);

  const displayUrl = inviteUrl ? absoluteInviteUrl(inviteUrl) : '';

  const copy = useCallback(() => {
    if (!displayUrl) return;
    void navigator.clipboard.writeText(displayUrl).then(
      () => emitAppToast('Ссылка скопирована — отправьте в чат', 'success'),
      () => emitAppToast('Не удалось скопировать ссылку', 'error'),
    );
  }, [displayUrl]);

  const share = useCallback(async () => {
    if (!displayUrl) return;
    const nav = navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function') {
      try {
        await nav.share({
          title: 'Приглашение на звонок',
          text: 'Подключитесь к конференции',
          url: displayUrl,
        });
        return;
      } catch {
        /* user cancelled or share failed — fall through to copy */
      }
    }
    copy();
  }, [copy, displayUrl]);

  return (
    <div className="call-invite-bar" role="dialog" aria-label="Ссылка для подключения">
      <button
        type="button"
        className="call-invite-bar__close"
        onClick={onCollapse}
        aria-label="Свернуть"
      >
        <LuX size={18} strokeWidth={2.2} />
      </button>
      <p className="call-invite-bar__title">Ссылка для подключения</p>
      <p className="call-invite-bar__hint">
        Отправьте в чат или мессенджер — участники зайдут по ссылке
      </p>
      <code className="call-invite-bar__url" title={displayUrl || undefined}>
        {busy && !displayUrl ? 'Получаем ссылку…' : displayUrl || 'Ссылка недоступна'}
      </code>
      <div className="call-invite-bar__actions">
        <button
          type="button"
          className="call-invite-btn call-invite-btn--secondary"
          disabled={!displayUrl}
          onClick={copy}
        >
          <LuCopy size={18} strokeWidth={2.2} aria-hidden />
          Скопировать
        </button>
        <button
          type="button"
          className="call-invite-btn call-invite-btn--primary"
          disabled={!displayUrl}
          onClick={() => void share()}
        >
          <LuShare2 size={18} strokeWidth={2.2} aria-hidden />
          Поделиться
        </button>
      </div>
    </div>
  );
}

/** Хост: панель ссылки + кнопка «Поделиться» у микрофона; автосворачивание при входе участников. */
function MeetingHostChrome({
  callId,
  videoEnabled,
  onHangup,
}: {
  callId: string;
  videoEnabled: boolean;
  onHangup: () => void;
}) {
  const remotes = useRemoteParticipants();
  const [inviteOpen, setInviteOpen] = useState(true);
  const hadRemotes = useRef(false);

  useEffect(() => {
    if (remotes.length === 0) return;
    if (!hadRemotes.current) {
      hadRemotes.current = true;
      setInviteOpen(false);
    }
  }, [remotes.length]);

  // Prefetch invite URL while collapsed so share opens instantly.
  const inviteUrl = useCallStore((s) => s.activeCall?.inviteUrl ?? null);
  const setInviteUrl = useCallStore((s) => s.setInviteUrl);
  useEffect(() => {
    if (inviteUrl) return;
    let cancelled = false;
    void createCallInvitation(callId)
      .then((inv) => {
        if (!cancelled) setInviteUrl(inv.inviteUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [callId, inviteUrl, setInviteUrl]);

  return (
    <>
      {inviteOpen ? (
        <MeetingInviteBar callId={callId} onCollapse={() => setInviteOpen(false)} />
      ) : null}
      <CallControls
        videoEnabled={videoEnabled}
        onHangup={onHangup}
        canShare
        shareOpen={inviteOpen}
        onToggleShare={() => setInviteOpen((v) => !v)}
      />
    </>
  );
}

function OutgoingRing({ activeCall, onCancel }: { activeCall: ActiveCallState; onCancel: () => void }) {
  const avatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;
  const showMeetingMark = activeCall.callKind === 'group' || !avatarSrc;

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
            {avatarSrc && !showMeetingMark ? (
              <img src={avatarSrc} alt="" className="call-stage__avatar" />
            ) : (
              <MeetingAvatar mediaType={activeCall.callType} size="lg" />
            )}
            <p className="call-stage__name">{activeCall.peerName}</p>
            <p className="call-stage__status">
              {activeCall.callType === 'video' ? 'Видеозвонок…' : 'Вызов…'}
            </p>
            {activeCall.inviteUrl ? (
              <button
                type="button"
                className="call-invite-btn call-invite-btn--primary"
                onClick={() => {
                  void navigator.clipboard.writeText(activeCall.inviteUrl!).then(
                    () => emitAppToast('Ссылка скопирована', 'success'),
                    () => emitAppToast('Не удалось скопировать ссылку', 'error'),
                  );
                }}
              >
                <LuCopy size={18} strokeWidth={2.2} aria-hidden />
                Скопировать ссылку
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

  // LiveKit Room.connect ждёт и signal, и первый ICE (waitForPCInitialConnection).
  useEffect(() => {
    if (!creds?.token || !creds.url || connectError || lkConnected) return;
    const t = window.setTimeout(() => {
      setConnectError('Ошибка сервера или идут технические работы. Попробуйте позже.');
    }, 32_000);
    return () => window.clearTimeout(t);
  }, [creds?.token, creds?.url, connectError, lkConnected]);

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      // Для 1:1 стабильнее без dynacast/adaptive — меньше «пропало видео до клика».
      adaptiveStream: false,
      dynacast: false,
      disconnectOnPageLeave: false,
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
        // Не останавливать mic track при mute — иначе часто мигает/падает камера и autoplay.
        stopMicTrackOnMute: false,
        videoCodec: 'vp8',
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
          unlockCallAudio();
          setLkConnected(true);
          setConnectError(null);
        }}
        onMediaDeviceFailure={() => {
          emitAppToast('Не удалось получить доступ к камере или микрофону', 'error');
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
        <RoomStage callType={activeCall.callType} connectError={connectError} />
        {activeCall.callKind === 'group' && activeCall.isInitiator ? (
          <MeetingHostChrome
            callId={activeCall.callId}
            videoEnabled={videoEnabled}
            onHangup={() => void hangup()}
          />
        ) : (
          <CallControls videoEnabled={videoEnabled} onHangup={() => void hangup()} />
        )}
      </LiveKitRoom>
    </div>
  );
}

export function CallWindow() {
  const activeCall = useCallStore((s) => s.activeCall);
  if (!activeCall) return null;
  return <CallWindowInner key={activeCall.callId} activeCall={activeCall} />;
}
