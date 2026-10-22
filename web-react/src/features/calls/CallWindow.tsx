import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  isTrackReference,
  useTracks,
  VideoTrack,
  useLocalParticipant,
  useConnectionState,
  useConnectionQualityIndicator,
  useRoomContext,
  useParticipants,
  useRemoteParticipants,
  useSpeakingParticipants,
  useIsSpeaking,
} from '@livekit/components-react';
import {
  ConnectionQuality,
  ConnectionState,
  DisconnectReason,
  ParticipantEvent,
  RoomEvent,
  Track,
  VideoPresets,
  type Participant,
  type Room,
  type RoomOptions,
  type RoomConnectOptions,
} from 'livekit-client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  IcChevronsDown,
  IcCopy,
  IcLayoutSpeaker,
  IcLayoutGrid,
  IcMic,
  IcMicOff,
  IcScreenShare,
  IcLayoutSidebar,
  IcHangup,
  IcShare,
  IcUsers,
  IcVideo,
  IcVideoOff,
  IcClose,
} from './callIcons';
import { useNavigate } from 'react-router-dom';

import { BodyPortal } from '../../components/BodyPortal';
import { emitAppToast } from '../../lib/uiFeedback';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { subscribeRealtimeMessages } from '../../lib/realtimeWsClient';
import { setTelegramCallPresentation } from '../../lib/telegramWebApp';
import { absoluteAppUrlForShare } from '../pwa/pwaInAppPath';

import {
  ActiveCallMinimizedBar,
  ActiveCallMinimizedBarSimple,
} from './ActiveCallMinimizedBar';
import {
  cancelCall,
  createCallInvitation,
  endCall,
  fetchCallToken,
  mapDeviceError,
  reportCallQuality,
  type CallTokenResponse,
} from './callsApi';
import {
  connectionQualityAriaLabel,
  connectionQualityBars,
  connectionQualityStatusLabel,
  connectionQualityTone,
} from './callConnectionQuality';
import { startCallRing, stopCallRing, unlockCallAudio } from './callRingtone';
import { copyInviteShare, formatInviteShareText, shareInviteLink } from './inviteShare';
import { MeetingAvatar } from './MeetingAvatar';
import { useCallStore, type ActiveCallState } from './callStore';
import './calls.css';

function MinimizeCallButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const minimizeCall = useCallStore((s) => s.minimizeCall);

  return (
    <button
      type="button"
      className={['call-minimize-btn', className].filter(Boolean).join(' ')}
      onClick={() => {
        minimizeCall();
        // Open chats list (not a conversation) so the Stories-style call ring is visible on mobile.
        void navigate('/messenger');
      }}
      aria-label="Свернуть звонок и продолжить пользоваться приложением"
      title="Свернуть"
    >
      <IcChevronsDown size={20} strokeWidth={2.3} aria-hidden />
    </button>
  );
}

function absoluteInviteUrl(url: string): string {
  // Rewrite /call/join to the current origin so shared links match the installed PWA scope on iOS.
  return absoluteAppUrlForShare(url);
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Индикатор уровня связи (деления), как в Telegram. */
function CallSignalBars({
  quality,
  compact = false,
}: {
  quality: ConnectionQuality;
  compact?: boolean;
}) {
  const bars = connectionQualityBars(quality);
  const tone = connectionQualityTone(quality);
  return (
    <span
      className={[
        'call-signal',
        `call-signal--${tone}`,
        compact ? 'call-signal--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={connectionQualityAriaLabel(quality)}
      title={connectionQualityAriaLabel(quality)}
      role="img"
    >
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={[
            'call-signal__bar',
            level <= bars ? 'call-signal__bar--on' : 'call-signal__bar--off',
          ].join(' ')}
          aria-hidden
        />
      ))}
    </span>
  );
}

function useParticipantConnectionQuality(participant?: Participant): ConnectionQuality {
  const { quality } = useConnectionQualityIndicator({ participant });
  return quality;
}

function isMobileUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/** Раскладки ПК-встречи (как в макете). */
type MeetingLayoutMode = 'grid' | 'speaker' | 'sidebar';

type MeetingUiState = {
  layoutMode: MeetingLayoutMode;
  setLayoutMode: (mode: MeetingLayoutMode) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  inviteOpen: boolean;
  setInviteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  isHost: boolean;
  callId: string;
  setStatusLabel: (label: string) => void;
};

const MeetingUiContext = createContext<MeetingUiState | null>(null);

function useMeetingUi(): MeetingUiState | null {
  return useContext(MeetingUiContext);
}

/** Разблокировать WebAudio + LiveKit HTMLMediaElement playback (autoplay policy). */
function resumeCallMedia(room?: Room | null): void {
  unlockCallAudio();
  if (!room) return;
  void room.startAudio().catch(() => undefined);
}

/**
 * Звук собеседника на iOS PWA / macOS Safari: autoplay policy блокирует <audio> без жеста,
 * а после фона/блокировки экрана браузер suspend'ит аудио. Повторяем startAudio():
 * при подключении, новых аудио-треках, смене статуса воспроизведения, возврате на foreground,
 * на любом первом жесте пользователя и коротким retry-циклом, пока звук не заработает.
 */
function KeepAliveCallMedia() {
  const room = useRoomContext();
  useEffect(() => {
    let disposed = false;
    let retryTimer: number | null = null;
    let retries = 0;

    const clearRetry = () => {
      if (retryTimer != null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const kick = () => {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      resumeCallMedia(room);
    };

    const scheduleRetry = () => {
      clearRetry();
      if (disposed || room.canPlaybackAudio || retries >= 20) return;
      retries += 1;
      retryTimer = window.setTimeout(() => {
        kick();
        scheduleRetry();
      }, 1500);
    };

    const onPlaybackChanged = () => {
      if (room.canPlaybackAudio) {
        retries = 0;
        clearRetry();
      } else {
        kick();
        scheduleRetry();
      }
    };

    const onTrack = () => {
      kick();
      scheduleRetry();
    };

    const onGesture = () => {
      kick();
    };

    // Сторож: iOS/Safari может молча поставить удалённый звук на паузу (маршрутизация
    // аудио после включения микрофона, прерывание системой, смена устройства вывода).
    const watchdog = window.setInterval(() => {
      if (disposed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!room.canPlaybackAudio) {
        resumeCallMedia(room);
        return;
      }
      document.querySelectorAll('audio').forEach((el) => {
        // Только потоки звонка (LiveKit ставит srcObject); голосовые мессенджера не трогаем.
        if (!(el.srcObject instanceof MediaStream)) return;
        if (el.muted) el.muted = false;
        if (el.paused) void el.play().catch(() => undefined);
      });
      unlockCallAudio();
    }, 2500);

    document.addEventListener('visibilitychange', kick);
    window.addEventListener('focus', kick);
    window.addEventListener('pageshow', kick);
    // Любой жест разблокирует autoplay: capture, чтобы не зависеть от stopPropagation в UI.
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('touchend', onGesture, true);
    document.addEventListener('click', onGesture, true);
    room.on(RoomEvent.AudioPlaybackStatusChanged, onPlaybackChanged);
    room.on(RoomEvent.TrackSubscribed, onTrack);
    room.on(RoomEvent.Connected, onTrack);
    room.on(RoomEvent.Reconnected, onTrack);
    kick();
    scheduleRetry();
    return () => {
      disposed = true;
      window.clearInterval(watchdog);
      clearRetry();
      document.removeEventListener('visibilitychange', kick);
      window.removeEventListener('focus', kick);
      window.removeEventListener('pageshow', kick);
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('touchend', onGesture, true);
      document.removeEventListener('click', onGesture, true);
      room.off(RoomEvent.AudioPlaybackStatusChanged, onPlaybackChanged);
      room.off(RoomEvent.TrackSubscribed, onTrack);
      room.off(RoomEvent.Connected, onTrack);
      room.off(RoomEvent.Reconnected, onTrack);
    };
  }, [room]);
  return null;
}

function connectionQualityToScore(q: ConnectionQuality): number | null {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 5;
    case ConnectionQuality.Good:
      return 4;
    case ConnectionQuality.Poor:
      return 2;
    case ConnectionQuality.Lost:
      return 0;
    default:
      return null;
  }
}

function connectionQualityLabel(q: ConnectionQuality): string | null {
  switch (q) {
    case ConnectionQuality.Excellent:
      return 'excellent';
    case ConnectionQuality.Good:
      return 'good';
    case ConnectionQuality.Poor:
      return 'poor';
    case ConnectionQuality.Lost:
      return 'lost';
    default:
      return null;
  }
}

/** Собирает ConnectionQuality локального участника и шлёт в API при выходе из комнаты. */
function ReportCallQuality({ callId }: { callId: string }) {
  const room = useRoomContext();
  const samplesRef = useRef<number[]>([]);
  const lastLabelRef = useRef<string | null>(null);
  const sentRef = useRef(false);

  useEffect(() => {
    const onQuality = (quality: ConnectionQuality) => {
      const score = connectionQualityToScore(quality);
      if (score != null) samplesRef.current.push(score);
      lastLabelRef.current = connectionQualityLabel(quality);
    };
    room.localParticipant.on(ParticipantEvent.ConnectionQualityChanged, onQuality);
    onQuality(room.localParticipant.connectionQuality);

    return () => {
      room.localParticipant.off(ParticipantEvent.ConnectionQualityChanged, onQuality);
      if (sentRef.current) return;
      const samples = samplesRef.current;
      if (samples.length === 0) return;
      sentRef.current = true;
      const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
      void reportCallQuality(callId, {
        score: Math.round(avg * 10) / 10,
        connectionQuality: lastLabelRef.current,
      });
    };
  }, [callId, room]);

  return null;
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
  onEndForAll,
  canShare = false,
  shareOpen = false,
  onToggleShare,
  variant = 'default',
  statusLabel,
  participantsOpen = false,
  onToggleParticipants,
}: {
  videoEnabled: boolean;
  onHangup: () => void;
  /** Хост/модератор: явное завершение комнаты для всех. */
  onEndForAll?: () => void;
  canShare?: boolean;
  shareOpen?: boolean;
  onToggleShare?: () => void;
  variant?: 'default' | 'meeting';
  statusLabel?: string;
  participantsOpen?: boolean;
  onToggleParticipants?: () => void;
}) {
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const connectionQuality = useParticipantConnectionQuality(localParticipant);
  const setMuted = useCallStore((s) => s.setMuted);
  const setVideoOff = useCallStore((s) => s.setVideoOff);
  const setScreenSharing = useCallStore((s) => s.setScreenSharing);
  const showScreenShare = !isMobileUa();

  // Источник истины — LiveKit participant, не zustand (иначе рассинхрон после mute).
  const isMuted = !isMicrophoneEnabled;
  const isVideoOff = videoEnabled ? !isCameraEnabled : true;
  const isScreenSharing = Boolean(isScreenShareEnabled);
  const isMeeting = variant === 'meeting';
  const [mediaBusy, setMediaBusy] = useState(false);
  const [leaveMenuOpen, setLeaveMenuOpen] = useState(false);
  const leaveWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!leaveMenuOpen) return;
    const onDoc = (ev: MouseEvent | TouchEvent) => {
      const root = leaveWrapRef.current;
      if (!root) return;
      if (ev.target instanceof Node && !root.contains(ev.target)) {
        setLeaveMenuOpen(false);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setLeaveMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [leaveMenuOpen]);

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
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      resumeCallMedia(room);
      await localParticipant.setMicrophoneEnabled(isMuted);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    } finally {
      setMediaBusy(false);
    }
  }, [isMuted, localParticipant, mediaBusy, room]);

  const toggleCam = useCallback(async () => {
    if (!videoEnabled || mediaBusy) return;
    setMediaBusy(true);
    try {
      resumeCallMedia(room);
      await localParticipant.setCameraEnabled(isVideoOff);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    } finally {
      setMediaBusy(false);
    }
  }, [isVideoOff, localParticipant, mediaBusy, room, videoEnabled]);

  const toggleScreen = useCallback(async () => {
    if (!showScreenShare || mediaBusy) {
      if (!showScreenShare) {
        emitAppToast('Демонстрация экрана недоступна на этом устройстве', 'info');
      }
      return;
    }
    setMediaBusy(true);
    try {
      resumeCallMedia(room);
      await localParticipant.setScreenShareEnabled(!isScreenSharing);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    } finally {
      setMediaBusy(false);
    }
  }, [isScreenSharing, localParticipant, mediaBusy, room, showScreenShare]);

  return (
    <div
      className={['call-controls', isMeeting ? 'call-controls--meeting' : ''].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label="Управление звонком"
    >
      {isMeeting && statusLabel ? (
        <span
          className={[
            'call-controls__timer',
            connectionQuality && connectionQualityStatusLabel(connectionQuality)
              ? 'call-controls__timer--warn'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-live="polite"
        >
          {connectionQuality ? <CallSignalBars quality={connectionQuality} compact /> : null}
          {statusLabel}
        </span>
      ) : null}
      <div className="call-controls__actions">
        <button
          type="button"
          className={[
            'call-ctrl',
            isMuted ? 'call-ctrl--off' : 'call-ctrl--mic-on',
          ].join(' ')}
          onClick={() => void toggleMic()}
          disabled={mediaBusy}
          aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          <span className="call-ctrl__icon">
            {isMuted ? <IcMicOff size={22} /> : <IcMic size={22} />}
          </span>
          <span className="call-ctrl__label">Микрофон</span>
        </button>
        {videoEnabled ? (
          <button
            type="button"
            className={['call-ctrl', isVideoOff ? 'call-ctrl--off' : ''].join(' ')}
            onClick={() => void toggleCam()}
            disabled={mediaBusy}
            aria-label={isVideoOff ? 'Включить камеру' : 'Выключить камеру'}
          >
            <span className="call-ctrl__icon">
              {isVideoOff ? <IcVideoOff size={22} /> : <IcVideo size={22} />}
            </span>
            <span className="call-ctrl__label">Камера</span>
          </button>
        ) : null}
        {showScreenShare ? (
          <button
            type="button"
            className={['call-ctrl', isScreenSharing ? 'call-ctrl--active' : ''].join(' ')}
            onClick={() => void toggleScreen()}
            disabled={mediaBusy}
            aria-label="Демонстрация экрана"
          >
            <span className="call-ctrl__icon">
              <IcScreenShare size={22} />
            </span>
            <span className="call-ctrl__label">Экран</span>
          </button>
        ) : null}
        {isMeeting && onToggleParticipants ? (
          <button
            type="button"
            className={['call-ctrl', participantsOpen ? 'call-ctrl--active' : ''].join(' ')}
            onClick={() => onToggleParticipants()}
            aria-label={participantsOpen ? 'Скрыть участников' : 'Участники'}
            aria-pressed={participantsOpen}
          >
            <span className="call-ctrl__icon">
              <IcUsers size={22} />
            </span>
            <span className="call-ctrl__label">Участники</span>
          </button>
        ) : null}
        {canShare ? (
          <button
            type="button"
            className={['call-ctrl', shareOpen ? 'call-ctrl--active' : ''].join(' ')}
            onClick={() => onToggleShare?.()}
            aria-label={shareOpen ? 'Скрыть ссылку' : 'Поделиться ссылкой'}
            aria-pressed={shareOpen}
          >
            <span className="call-ctrl__icon">
              <IcShare size={22} />
            </span>
            <span className="call-ctrl__label">Ссылка</span>
          </button>
        ) : null}
      </div>
      <div className="call-leave-wrap" ref={leaveWrapRef}>
        {leaveMenuOpen && onEndForAll ? (
          <div className="call-leave-menu" role="menu" aria-label="Выход из встречи">
            <button
              type="button"
              className="call-leave-menu__btn"
              role="menuitem"
              onClick={() => {
                setLeaveMenuOpen(false);
                onHangup();
              }}
            >
              Выйти из встречи
            </button>
            <button
              type="button"
              className="call-leave-menu__btn call-leave-menu__btn--danger"
              role="menuitem"
              onClick={() => {
                setLeaveMenuOpen(false);
                onEndForAll();
              }}
            >
              Завершить для всех
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={['call-ctrl', 'call-ctrl--hangup', isMeeting ? 'call-ctrl--hangup-wide' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            if (onEndForAll) {
              setLeaveMenuOpen((v) => !v);
              return;
            }
            onHangup();
          }}
          aria-label={onEndForAll ? 'Выйти или завершить встречу' : 'Выйти'}
          aria-haspopup={onEndForAll ? 'menu' : undefined}
          aria-expanded={onEndForAll ? leaveMenuOpen : undefined}
        >
          <span className="call-ctrl__icon">
            <IcHangup size={22} />
          </span>
          <span className="call-ctrl__label">Выйти</span>
        </button>
      </div>
    </div>
  );
}

/** Apply mic/cam lobby toggles once after LiveKit connects. */
function ApplyLobbyMediaPrefs({
  micOn,
  camOn,
  videoEnabled,
}: {
  micOn: boolean;
  camOn: boolean;
  videoEnabled: boolean;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const applied = useRef(false);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || applied.current) return;
    applied.current = true;
    void room.localParticipant
      .setMicrophoneEnabled(micOn)
      .catch((e) => {
        emitAppToast(mapDeviceError(e), 'error');
      });
    if (videoEnabled) {
      void room.localParticipant
        .setCameraEnabled(camOn)
        .catch((e) => {
          emitAppToast(mapDeviceError(e), 'error');
        });
    }
  }, [camOn, connectionState, micOn, room, videoEnabled]);

  return null;
}

/** Sticky active speaker for Zoom-style spotlight (remote preferred). */
function useStickySpotlightIdentity(participants: Participant[]): string | null {
  const speaking = useSpeakingParticipants();
  const [spotlightId, setSpotlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!speaking.length) return;
    const pick = speaking.find((p) => !p.isLocal) ?? speaking[0];
    if (pick?.identity) setSpotlightId(pick.identity);
  }, [speaking]);

  useEffect(() => {
    if (!spotlightId) return;
    if (!participants.some((p) => p.identity === spotlightId)) {
      setSpotlightId(null);
    }
  }, [participants, spotlightId]);

  return spotlightId;
}

function useParticipantMediaFlags(participant: Participant): { micOn: boolean; camOn: boolean } {
  const [micOn, setMicOn] = useState(() => participant.isMicrophoneEnabled);
  const [camOn, setCamOn] = useState(() => participant.isCameraEnabled);
  useEffect(() => {
    const update = () => {
      setMicOn(participant.isMicrophoneEnabled);
      setCamOn(participant.isCameraEnabled);
    };
    update();
    const events = [
      ParticipantEvent.TrackMuted,
      ParticipantEvent.TrackUnmuted,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
    ] as const;
    for (const event of events) participant.on(event, update);
    return () => {
      for (const event of events) participant.off(event, update);
    };
  }, [participant]);
  return { micOn, camOn };
}

function SpeakingWaveform({ active, variant = 'bar' }: { active: boolean; variant?: 'bar' | 'sides' }) {
  if (variant === 'sides') {
    return (
      <>
        <div
          className={['call-waveform-sides', 'call-waveform-sides--left', active ? 'call-waveform-sides--active' : '']
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div
          className={['call-waveform-sides', 'call-waveform-sides--right', active ? 'call-waveform-sides--active' : '']
            .filter(Boolean)
            .join(' ')}
          aria-hidden
        >
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </>
    );
  }
  return (
    <div
      className={['call-waveform', active ? 'call-waveform--active' : ''].filter(Boolean).join(' ')}
      aria-hidden
    >
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function MeetingOverflowTile({ count }: { count: number }) {
  const label =
    count === 1 ? '+1 участник' : count < 5 ? `+${count} участника` : `+${count} участников`;
  return (
    <div className="call-participant-tile call-participant-tile--overflow" aria-label={label}>
      <div className="call-participant-tile__media call-participant-tile__media--overflow">
        <IcUsers size={28} strokeWidth={2} aria-hidden />
        <span className="call-participant-tile__overflow-count">+{count}</span>
      </div>
      <p className="call-participant-tile__name">{label}</p>
    </div>
  );
}

function CameraOffPortrait({
  name,
  avatarSrc,
  compact = false,
}: {
  name: string;
  avatarSrc?: string;
  compact?: boolean;
}) {
  const initials = participantInitials(name);
  return (
    <div
      className={['call-cam-off', compact ? 'call-cam-off--compact' : ''].filter(Boolean).join(' ')}
      aria-hidden
    >
      <span className="call-cam-off__glow" />
      {avatarSrc ? (
        <img src={avatarSrc} alt="" className="call-cam-off__avatar" />
      ) : (
        <div className="call-cam-off__initials" data-initials={initials}>
          {initials}
        </div>
      )}
    </div>
  );
}

function MeetingParticipantTile({
  participant,
  callType,
  cameraTrack,
  size = 'default',
}: {
  participant: Participant;
  callType: 'audio' | 'video';
  cameraTrack: ReturnType<typeof useTracks>[number] | null;
  size?: 'default' | 'spotlight' | 'strip';
}) {
  const name = participantDisplayName(participant);
  const displayName = participant.isLocal ? `${name} (вы)` : name;
  const avatarSrc = participantAvatarUrl(participant);
  const speaking = useIsSpeaking(participant);
  const quality = useParticipantConnectionQuality(participant);
  const qualityWarn =
    quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;
  const { micOn, camOn } = useParticipantMediaFlags(participant);
  const isAudio = callType === 'audio';
  const isSpotlight = size === 'spotlight';
  const trackMuted = Boolean(
    cameraTrack && isTrackReference(cameraTrack) && cameraTrack.publication?.isMuted,
  );
  // Камера выкл. / muted → не VideoTrack (чёрный кадр), а аватар или инициалы.
  const showVideo =
    callType === 'video' &&
    camOn &&
    !trackMuted &&
    Boolean(cameraTrack && isTrackReference(cameraTrack) && cameraTrack.publication?.track);

  return (
    <div
      className={[
        'call-participant-tile',
        isAudio ? 'call-participant-tile--audio' : 'call-participant-tile--video',
        isSpotlight ? 'call-participant-tile--spotlight' : '',
        size === 'strip' ? 'call-participant-tile--strip' : '',
        speaking ? 'call-participant-tile--speaking' : '',
        !micOn ? 'call-participant-tile--mic-off' : '',
        !isAudio && !showVideo ? 'call-participant-tile--cam-off' : '',
        participant.isLocal ? 'call-participant-tile--local' : '',
        qualityWarn ? 'call-participant-tile--weak-net' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="call-participant-tile__media">
        {isAudio && speaking ? (
          <>
            <span className="call-participant-tile__speak-ring" aria-hidden />
            <span className="call-participant-tile__speak-ring call-participant-tile__speak-ring--late" aria-hidden />
          </>
        ) : null}
        {showVideo && cameraTrack && isTrackReference(cameraTrack) ? (
          <VideoTrack
            trackRef={cameraTrack}
            className="call-participant-tile__video"
            manageSubscription={false}
            playsInline
            autoPlay
          />
        ) : isAudio ? (
          avatarSrc ? (
            <img src={avatarSrc} alt="" className="call-participant-tile__avatar-img" />
          ) : (
            <div className="call-participant-tile__initials" aria-hidden>
              {participantInitials(name)}
            </div>
          )
        ) : (
          <CameraOffPortrait name={name} avatarSrc={avatarSrc} compact={size === 'strip'} />
        )}
        {!isAudio ? (
          <div className="call-participant-tile__chrome">
            <span
              className={[
                'call-participant-tile__pill',
                speaking ? 'call-participant-tile__pill--speaking' : '',
                !micOn ? 'call-participant-tile__pill--mic-off' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className={[
                  'call-participant-tile__mic',
                  micOn ? '' : 'call-participant-tile__mic--off',
                  speaking ? 'call-participant-tile__mic--speaking' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={micOn ? (speaking ? 'Говорит' : 'Микрофон включён') : 'Микрофон выключен'}
              >
                {micOn ? <IcMic size={13} strokeWidth={2.4} /> : <IcMicOff size={13} strokeWidth={2.4} />}
              </span>
              <span className="call-participant-tile__label">{displayName}</span>
              {qualityWarn || participant.isLocal ? (
                <CallSignalBars quality={quality} compact />
              ) : null}
            </span>
          </div>
        ) : null}
        {isAudio && isSpotlight ? <SpeakingWaveform active={speaking} variant="sides" /> : null}
      </div>
      {isAudio ? (
        <>
          {isSpotlight ? <SpeakingWaveform active={speaking} variant="bar" /> : null}
          <div className="call-participant-tile__meta">
            <p className="call-participant-tile__name">{displayName}</p>
            {qualityWarn || participant.isLocal ? <CallSignalBars quality={quality} compact /> : null}
            <span
              className={[
                'call-participant-tile__mic',
                'call-participant-tile__mic--inline',
                micOn ? '' : 'call-participant-tile__mic--off',
                speaking ? 'call-participant-tile__mic--speaking' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden
            >
              {micOn ? <IcMic size={12} strokeWidth={2.4} /> : <IcMicOff size={12} strokeWidth={2.4} />}
            </span>
          </div>
        </>
      ) : size === 'strip' || size === 'spotlight' ? (
        <p className="call-participant-tile__name call-participant-tile__name--sr">{displayName}</p>
      ) : null}
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
  const { isCameraEnabled, localParticipant: lkLocal } = useLocalParticipant();
  const localQuality = useParticipantConnectionQuality(lkLocal);
  const peerName = useCallStore((s) => s.activeCall?.peerName ?? 'Собеседник');
  const peerAvatar = useCallStore((s) => s.activeCall?.peerAvatar ?? '');
  const callKind = useCallStore((s) => s.activeCall?.callKind ?? 'direct');
  const [elapsed, setElapsed] = useState(0);
  /** LiveKit стартует в Disconnected — это не ошибка, пока не было Connecting/Connected. */
  const [connectAttempted, setConnectAttempted] = useState(false);
  const connected = connectionState === ConnectionState.Connected;
  const stageRef = useRef<HTMLDivElement | null>(null);
  const isGroup = callKind === 'group';
  const weakNetLabel =
    connected && !connectError ? connectionQualityStatusLabel(localQuality) : null;

  useEffect(() => {
    if (
      connectionState === ConnectionState.Connecting ||
      connectionState === ConnectionState.Connected ||
      connectionState === ConnectionState.Reconnecting
    ) {
      setConnectAttempted(true);
    }
  }, [connectionState]);

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
  const remoteCamOff = Boolean(
    remoteCam &&
      isTrackReference(remoteCam) &&
      (remoteCam.publication?.isMuted || !remoteCam.participant.isCameraEnabled),
  );
  const showRemoteVideo =
    !isGroup &&
    callType === 'video' &&
    Boolean(remoteVideo?.publication?.track) &&
    !(remoteVideo === remoteCam && remoteCamOff);
  const showLocalPip = !isGroup && callType === 'video' && Boolean(localVideo) && isCameraEnabled;

  const avatarSrc = peerAvatar ? resolvePublicUrl(peerAvatar) : undefined;
  const disconnectedAfterAttempt =
    connectionState === ConnectionState.Disconnected && connectAttempted;
  // Прямой звонок: таймер / статусы. Слабая сеть — как в Telegram вместо таймера.
  let statusLabel = 'Соединение…';
  if (connectError) statusLabel = connectError;
  else if (connectionState === ConnectionState.Connected) {
    statusLabel = weakNetLabel ?? formatDuration(elapsed);
  } else if (connectionState === ConnectionState.Connecting) statusLabel = 'Подключение к серверу…';
  else if (connectionState === ConnectionState.Reconnecting) {
    statusLabel = 'Переподключение…';
  } else if (disconnectedAfterAttempt) {
    statusLabel = 'Ошибка сервера или идут технические работы';
  }

  let groupWaitLabel = 'Ждём участников';
  if (connectError) groupWaitLabel = connectError;
  else if (connectionState === ConnectionState.Connecting) groupWaitLabel = 'Подключение…';
  else if (connectionState === ConnectionState.Reconnecting) groupWaitLabel = 'Переподключение…';
  else if (disconnectedAfterAttempt) {
    groupWaitLabel = 'Ошибка сервера или идут технические работы. Попробуйте позже.';
  } else if (connectionState === ConnectionState.Disconnected) {
    groupWaitLabel = 'Подключение…';
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

  const stickySpotlightId = useStickySpotlightIdentity(sortedParticipants);
  const spotlightParticipant = useMemo(() => {
    if (!sortedParticipants.length) return null;
    return (
      sortedParticipants.find((p) => p.identity === stickySpotlightId) ??
      sortedParticipants.find((p) => !p.isLocal) ??
      sortedParticipants[0] ??
      null
    );
  }, [sortedParticipants, stickySpotlightId]);
  const stripParticipants = useMemo(() => {
    if (!spotlightParticipant) return sortedParticipants;
    return sortedParticipants.filter((p) => p.identity !== spotlightParticipant.identity);
  }, [sortedParticipants, spotlightParticipant]);

  const localParticipant = sortedParticipants.find((p) => p.isLocal) ?? null;
  const waitingAlone = isGroup && remotes.length === 0;
  const groupScreenShare =
    isGroup && remoteScreen && isTrackReference(remoteScreen) ? remoteScreen : null;
  const localScreenRaw = tracks.find(
    (t) =>
      t.participant.isLocal &&
      t.source === Track.Source.ScreenShare &&
      t.publication?.track,
  );
  const localScreenShare =
    localScreenRaw && isTrackReference(localScreenRaw) ? localScreenRaw : null;
  const stageScreenShare = groupScreenShare ?? localScreenShare;
  const meetingTitle = peerName?.trim() || 'Встреча';
  const meetingUi = useMeetingUi();
  const layoutMode: MeetingLayoutMode =
    meetingUi?.layoutMode ?? (callType === 'audio' ? 'speaker' : 'grid');

  /** Focus layout: speaker (лента снизу) или sidebar (лента справа, ПК). */
  const useFocusLayout =
    isGroup &&
    !waitingAlone &&
    !stageScreenShare &&
    (layoutMode === 'speaker' || layoutMode === 'sidebar') &&
    sortedParticipants.length >= 2;

  const VIDEO_GRID_VISIBLE = 8;
  const showVideoOverflow =
    !useFocusLayout && callType === 'video' && sortedParticipants.length > VIDEO_GRID_VISIBLE;
  const visibleGridParticipants = showVideoOverflow
    ? sortedParticipants.slice(0, VIDEO_GRID_VISIBLE)
    : sortedParticipants;
  const overflowCount = showVideoOverflow
    ? sortedParticipants.length - VIDEO_GRID_VISIBLE
    : 0;

  /** Лимит плиток в speaker/sidebar — иначе на слабых устройствах падает декодер. */
  const STRIP_VISIBLE = callType === 'audio' ? 8 : 6;
  const showStripOverflow = useFocusLayout && stripParticipants.length > STRIP_VISIBLE;
  const visibleStripParticipants = showStripOverflow
    ? stripParticipants.slice(0, STRIP_VISIBLE)
    : stripParticipants;
  const stripOverflowCount = showStripOverflow
    ? stripParticipants.length - STRIP_VISIBLE
    : 0;

  const groupStatusText = connectError
    ? connectError
    : connectionState === ConnectionState.Connected
      ? (weakNetLabel ?? formatDuration(elapsed))
      : connectionState === ConnectionState.Reconnecting
        ? 'Переподключение…'
        : 'Подключение…';

  const setMeetingStatusLabel = meetingUi?.setStatusLabel;
  useEffect(() => {
    setMeetingStatusLabel?.(groupStatusText);
  }, [groupStatusText, setMeetingStatusLabel]);

  // Один toast при переходе в «слабая связь» — без спама на каждом тике.
  const lastWeakToastRef = useRef<ConnectionQuality | null>(null);
  useEffect(() => {
    if (!connected || connectError) {
      lastWeakToastRef.current = null;
      return;
    }
    if (
      (localQuality === ConnectionQuality.Poor || localQuality === ConnectionQuality.Lost) &&
      lastWeakToastRef.current !== localQuality
    ) {
      lastWeakToastRef.current = localQuality;
      emitAppToast(
        localQuality === ConnectionQuality.Lost ? 'Нет связи с сервером' : 'Слабая связь',
        'info',
      );
    }
    if (localQuality === ConnectionQuality.Excellent || localQuality === ConnectionQuality.Good) {
      lastWeakToastRef.current = null;
    }
  }, [connected, connectError, localQuality]);

  return (
    <div
      className={[
        'call-stage',
        isGroup ? 'call-stage--meeting' : '',
        callType === 'audio' ? 'call-stage--audio' : 'call-stage--video',
        useFocusLayout && layoutMode === 'sidebar' ? 'call-stage--sidebar-layout' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={stageRef}
    >
      {isGroup ? (
        <header className="call-meeting-topbar" aria-label="Информация о встрече">
          <div className="call-meeting-topbar__title-wrap">
            <MinimizeCallButton className="call-minimize-btn--topbar" />
            <h1 className="call-meeting-topbar__title" title={meetingTitle}>
              {meetingTitle}
            </h1>
          </div>
          <div className="call-meeting-topbar__meta">
            {connected && !connectError ? (
              <span
                className={[
                  'call-meeting-topbar__net',
                  weakNetLabel ? 'call-meeting-topbar__net--warn' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={connectionQualityAriaLabel(localQuality)}
              >
                <CallSignalBars quality={localQuality} />
                {weakNetLabel ? (
                  <span className="call-meeting-topbar__net-label">{weakNetLabel}</span>
                ) : null}
              </span>
            ) : null}
            <span className="call-meeting-topbar__count" title="Участники">
              <IcUsers size={14} strokeWidth={2.4} aria-hidden />
              {Math.max(1, sortedParticipants.length)}
            </span>
            {meetingUi ? (
              <div className="call-layout-switch" role="group" aria-label="Раскладка">
                <button
                  type="button"
                  className={[
                    'call-layout-switch__btn',
                    layoutMode === 'grid' ? 'call-layout-switch__btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => meetingUi.setLayoutMode('grid')}
                  aria-label="Сетка"
                  aria-pressed={layoutMode === 'grid'}
                  title="Сетка"
                >
                  <IcLayoutGrid size={16} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className={[
                    'call-layout-switch__btn',
                    layoutMode === 'speaker' ? 'call-layout-switch__btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => meetingUi.setLayoutMode('speaker')}
                  aria-label="Говорящий"
                  aria-pressed={layoutMode === 'speaker'}
                  title="Говорящий крупно"
                >
                  <IcLayoutSpeaker size={16} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  className={[
                    'call-layout-switch__btn',
                    'call-layout-switch__btn--desktop',
                    layoutMode === 'sidebar' ? 'call-layout-switch__btn--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => meetingUi.setLayoutMode('sidebar')}
                  aria-label="Боковая лента"
                  aria-pressed={layoutMode === 'sidebar'}
                  title="Боковая лента"
                >
                  <IcLayoutSidebar size={16} strokeWidth={2.2} />
                </button>
              </div>
            ) : (
              <span className="call-meeting-topbar__timer">{groupStatusText}</span>
            )}
          </div>
        </header>
      ) : null}
      <div
        className={[
          'call-stage__main',
          isGroup && !waitingAlone ? 'call-stage__main--filled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isGroup ? (
          waitingAlone ? (
            <div className="call-meeting-lobby">
              {localParticipant ? (
                <MeetingParticipantTile
                  participant={localParticipant}
                  callType={callType}
                  cameraTrack={cameraByIdentity.get(localParticipant.identity) ?? null}
                  size={callType === 'audio' ? 'spotlight' : 'default'}
                />
              ) : (
                <MeetingAvatar mediaType={callType} size="lg" />
              )}
              <p className="call-meeting-lobby__wait">{groupWaitLabel}</p>
            </div>
          ) : useFocusLayout && spotlightParticipant ? (
            <div
              className={[
                'call-speaker-layout',
                callType === 'audio' ? 'call-speaker-layout--audio' : 'call-speaker-layout--video',
                layoutMode === 'sidebar' ? 'call-speaker-layout--sidebar' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Участники встречи"
            >
              <div className="call-speaker-layout__spotlight">
                <MeetingParticipantTile
                  participant={spotlightParticipant}
                  callType={callType}
                  cameraTrack={cameraByIdentity.get(spotlightParticipant.identity) ?? null}
                  size="spotlight"
                />
              </div>
              {visibleStripParticipants.length > 0 || stripOverflowCount > 0 ? (
                <div
                  className={[
                    'call-speaker-layout__strip',
                    callType === 'audio' && layoutMode !== 'sidebar'
                      ? 'call-speaker-layout__strip--grid'
                      : '',
                    layoutMode === 'sidebar' ? 'call-speaker-layout__strip--vertical' : '',
                    visibleStripParticipants.length + (stripOverflowCount > 0 ? 1 : 0) === 1
                      ? 'call-speaker-layout__strip--solo'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label="Остальные участники"
                >
                  {visibleStripParticipants.map((p) => (
                    <MeetingParticipantTile
                      key={p.identity || p.sid}
                      participant={p}
                      callType={callType}
                      cameraTrack={cameraByIdentity.get(p.identity) ?? null}
                      size="strip"
                    />
                  ))}
                  {stripOverflowCount > 0 ? <MeetingOverflowTile count={stripOverflowCount} /> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {stageScreenShare ? (
                <div className="call-group-screenshare" aria-label="Демонстрация экрана">
                  <VideoTrack
                    trackRef={stageScreenShare}
                    className="call-group-screenshare__video"
                    manageSubscription={false}
                    playsInline
                    autoPlay
                  />
                </div>
              ) : null}
              <div
                className={[
                  'call-participants',
                  'call-participants--modern',
                  callType === 'audio' ? 'call-participants--audio' : 'call-participants--video',
                  (showVideoOverflow ? VIDEO_GRID_VISIBLE + 1 : sortedParticipants.length) <= 9
                    ? `call-participants--n${showVideoOverflow ? VIDEO_GRID_VISIBLE + 1 : sortedParticipants.length}`
                    : 'call-participants--many',
                ].join(' ')}
                style={
                  {
                    '--cp-count': String(
                      Math.max(
                        1,
                        showVideoOverflow ? VIDEO_GRID_VISIBLE + 1 : sortedParticipants.length,
                      ),
                    ),
                  } as CSSProperties
                }
                aria-label="Участники встречи"
              >
                {visibleGridParticipants.map((p) => (
                  <MeetingParticipantTile
                    key={p.identity || p.sid}
                    participant={p}
                    callType={callType}
                    cameraTrack={cameraByIdentity.get(p.identity) ?? null}
                  />
                ))}
                {overflowCount > 0 ? <MeetingOverflowTile count={overflowCount} /> : null}
              </div>
            </>
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
                {callType === 'video' ? (
                  <CameraOffPortrait
                    name={peerName}
                    avatarSrc={avatarSrc || undefined}
                  />
                ) : avatarSrc ? (
                  <img src={avatarSrc} alt="" className="call-stage__avatar" />
                ) : (
                  <MeetingAvatar mediaType={callType} size="lg" />
                )}
                <p className="call-stage__name">{peerName}</p>
                <p
                  className={[
                    'call-stage__status',
                    weakNetLabel ? 'call-stage__status--warn' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {connected && !connectError ? (
                    <CallSignalBars quality={localQuality} compact />
                  ) : null}
                  {statusLabel}
                </p>
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
      {!isGroup && showRemoteVideo ? (
        <p
          className={[
            'call-stage__status',
            'call-stage__status--bar',
            weakNetLabel ? 'call-stage__status--warn' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {connected && !connectError ? <CallSignalBars quality={localQuality} compact /> : null}
          {statusLabel}
        </p>
      ) : null}
      <RoomAudioRenderer />
      <StartAudio label="Нажмите, чтобы включить звук" className="call-start-audio" />
    </div>
  );
}

/** Панель ссылки: на старте раскрыта, после подключения участников — сворачивается. */
function MeetingInviteBar({ callId, onCollapse }: { callId: string; onCollapse: () => void }) {
  const inviteUrl = useCallStore((s) => s.activeCall?.inviteUrl ?? null);
  const meetingTitle = useCallStore((s) => s.activeCall?.peerName?.trim() || 'Встреча');
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
    void copyInviteShare(meetingTitle, displayUrl).then((ok) => {
      if (ok) emitAppToast('Название и ссылка скопированы', 'success');
      else emitAppToast('Не удалось скопировать ссылку', 'error');
    });
  }, [displayUrl, meetingTitle]);

  const share = useCallback(async () => {
    if (!displayUrl) return;
    const result = await shareInviteLink(meetingTitle, displayUrl);
    if (result === 'copied') {
      emitAppToast('Название и ссылка скопированы', 'success');
    } else if (result === 'failed') {
      emitAppToast('Не удалось поделиться ссылкой', 'error');
    }
  }, [displayUrl, meetingTitle]);

  return (
    <div className="call-invite-bar" role="dialog" aria-label="Ссылка для подключения">
      <button
        type="button"
        className="call-invite-bar__close"
        onClick={onCollapse}
        aria-label="Свернуть"
      >
        <IcClose size={18} strokeWidth={2.2} />
      </button>
      <p className="call-invite-bar__title">{meetingTitle}</p>
      <p className="call-invite-bar__hint">
        При шаринге уйдёт название и ссылка — отправьте в чат или мессенджер
      </p>
      <code className="call-invite-bar__url" title={displayUrl || undefined}>
        {busy && !displayUrl
          ? 'Получаем ссылку…'
          : displayUrl
            ? formatInviteShareText(meetingTitle, displayUrl)
            : 'Ссылка недоступна'}
      </code>
      <div className="call-invite-bar__actions">
        <button
          type="button"
          className="call-invite-btn call-invite-btn--secondary"
          disabled={!displayUrl}
          onClick={copy}
        >
          <IcCopy size={18} strokeWidth={2.2} aria-hidden />
          Скопировать
        </button>
        <button
          type="button"
          className="call-invite-btn call-invite-btn--primary"
          disabled={!displayUrl}
          onClick={() => void share()}
        >
          <IcShare size={18} strokeWidth={2.2} aria-hidden />
          Поделиться
        </button>
      </div>
    </div>
  );
}

function MeetingSidePanelRow({ participant }: { participant: Participant }) {
  const name = participantDisplayName(participant);
  const avatarSrc = participantAvatarUrl(participant);
  const speaking = useIsSpeaking(participant);
  const { micOn, camOn } = useParticipantMediaFlags(participant);

  return (
    <li
      className={[
        'call-sidepanel__row',
        speaking ? 'call-sidepanel__row--speaking' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="call-sidepanel__avatar" aria-hidden>
        {avatarSrc ? (
          <img src={avatarSrc} alt="" />
        ) : (
          <span>{participantInitials(name)}</span>
        )}
      </div>
      <div className="call-sidepanel__info">
        <p className="call-sidepanel__name">
          {participant.isLocal ? `${name} (вы)` : name}
        </p>
        <p className="call-sidepanel__status">
          {speaking ? 'Говорит' : micOn ? 'В сети' : 'Микрофон выкл.'}
        </p>
      </div>
      <div className="call-sidepanel__flags">
        <span
          className={[
            'call-sidepanel__flag',
            !micOn ? 'call-sidepanel__flag--off' : '',
            speaking ? 'call-sidepanel__flag--speak' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={micOn ? 'Микрофон' : 'Микрофон выкл.'}
        >
          {micOn ? <IcMic size={14} /> : <IcMicOff size={14} />}
        </span>
        <span
          className={['call-sidepanel__flag', !camOn ? 'call-sidepanel__flag--off' : '']
            .filter(Boolean)
            .join(' ')}
          title={camOn ? 'Камера' : 'Камера выкл.'}
        >
          {camOn ? <IcVideo size={14} /> : <IcVideoOff size={14} />}
        </span>
      </div>
    </li>
  );
}

function MeetingSidePanel({
  callId,
  isHost,
  onClose,
}: {
  callId: string;
  isHost: boolean;
  onClose: () => void;
}) {
  const participants = useParticipants();
  const meetingTitle = useCallStore((s) => s.activeCall?.peerName?.trim() || 'Встреча');
  const inviteUrl = useCallStore((s) => s.activeCall?.inviteUrl ?? null);
  const setInviteUrl = useCallStore((s) => s.setInviteUrl);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      return participantDisplayName(a).localeCompare(participantDisplayName(b), 'ru');
    });
  }, [participants]);

  useEffect(() => {
    if (inviteUrl || !isHost) return;
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
  }, [callId, inviteUrl, isHost, setInviteUrl]);

  const displayUrl = inviteUrl ? absoluteInviteUrl(inviteUrl) : '';

  const copy = useCallback(() => {
    if (!displayUrl) return;
    void copyInviteShare(meetingTitle, displayUrl).then((ok) => {
      if (ok) emitAppToast('Название и ссылка скопированы', 'success');
      else emitAppToast('Не удалось скопировать ссылку', 'error');
    });
  }, [displayUrl, meetingTitle]);

  return (
    <aside className="call-sidepanel" aria-label="Участники встречи">
      <header className="call-sidepanel__head">
        <h2 className="call-sidepanel__title">Участники ({sorted.length})</h2>
        <button type="button" className="call-sidepanel__close" onClick={onClose} aria-label="Закрыть">
          <IcClose size={18} strokeWidth={2.2} />
        </button>
      </header>
      <ul className="call-sidepanel__list">
        {sorted.map((p) => (
          <MeetingSidePanelRow key={p.identity || p.sid} participant={p} />
        ))}
      </ul>
      {isHost ? (
        <div className="call-sidepanel__invite">
          <p className="call-sidepanel__invite-label">Ссылка для приглашения</p>
          <code className="call-sidepanel__invite-url" title={displayUrl || undefined}>
            {busy && !displayUrl ? 'Получаем ссылку…' : displayUrl || 'Нет ссылки'}
          </code>
          <button
            type="button"
            className="call-invite-btn call-invite-btn--primary call-sidepanel__invite-btn"
            disabled={!displayUrl}
            onClick={copy}
          >
            <IcCopy size={16} strokeWidth={2.2} aria-hidden />
            Пригласить участников
          </button>
        </div>
      ) : null}
    </aside>
  );
}

/** ПК/мобильная оболочка групповой встречи: раскладки, панель участников, панель управления. */
function GroupMeetingShell({
  callId,
  videoEnabled,
  callType,
  isHost,
  connectError,
  onHangup,
  onEndForAll,
}: {
  callId: string;
  videoEnabled: boolean;
  callType: 'audio' | 'video';
  isHost: boolean;
  connectError: string | null;
  onHangup: () => void;
  onEndForAll?: () => void;
}) {
  const remotes = useRemoteParticipants();
  const [layoutMode, setLayoutMode] = useState<MeetingLayoutMode>(() =>
    callType === 'audio' ? 'speaker' : 'grid',
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(isHost);
  const [statusLabel, setStatusLabel] = useState('Подключение…');
  const hadRemotes = useRef(false);

  // Sidebar-раскладка только для ПК; на узком экране откатываем в speaker.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 959px)');
    const sync = () => {
      if (mq.matches) {
        setLayoutMode((mode) => (mode === 'sidebar' ? 'speaker' : mode));
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (remotes.length === 0) return;
    if (!hadRemotes.current) {
      hadRemotes.current = true;
      setInviteOpen(false);
    }
  }, [remotes.length]);

  const inviteUrl = useCallStore((s) => s.activeCall?.inviteUrl ?? null);
  const setInviteUrl = useCallStore((s) => s.setInviteUrl);
  useEffect(() => {
    if (inviteUrl || !isHost) return;
    let cancelled = false;
    void createCallInvitation(callId)
      .then((inv) => {
        if (!cancelled) setInviteUrl(inv.inviteUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [callId, inviteUrl, isHost, setInviteUrl]);

  const meetingUi = useMemo<MeetingUiState>(
    () => ({
      layoutMode,
      setLayoutMode,
      panelOpen,
      setPanelOpen,
      inviteOpen,
      setInviteOpen,
      isHost,
      callId,
      setStatusLabel,
    }),
    [layoutMode, panelOpen, inviteOpen, isHost, callId],
  );

  return (
    <MeetingUiContext.Provider value={meetingUi}>
      <div
        className={[
          'call-meeting-shell',
          panelOpen ? 'call-meeting-shell--panel-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="call-meeting-shell__main">
          <RoomStage callType={callType} connectError={connectError} />
          {inviteOpen && isHost && !panelOpen ? (
            <MeetingInviteBar callId={callId} onCollapse={() => setInviteOpen(false)} />
          ) : null}
          <CallControls
            videoEnabled={videoEnabled}
            onHangup={onHangup}
            onEndForAll={isHost ? onEndForAll : undefined}
            canShare={isHost}
            shareOpen={inviteOpen}
            onToggleShare={() => {
              if (panelOpen) {
                setPanelOpen(false);
                setInviteOpen(true);
              } else {
                setInviteOpen((v) => !v);
              }
            }}
            variant="meeting"
            statusLabel={statusLabel}
            participantsOpen={panelOpen}
            onToggleParticipants={() => {
              setPanelOpen((v) => !v);
              if (!panelOpen) setInviteOpen(false);
            }}
          />
        </div>
        {panelOpen ? (
          <MeetingSidePanel
            callId={callId}
            isHost={isHost}
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
      </div>
    </MeetingUiContext.Provider>
  );
}

function OutgoingRing({ activeCall, onCancel }: { activeCall: ActiveCallState; onCancel: () => void }) {
  const avatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;
  const showMeetingMark = activeCall.callKind === 'group' || !avatarSrc;
  const uiMinimized = useCallStore((s) => s.uiMinimized);

  useEffect(() => {
    unlockCallAudio();
    const stop = startCallRing('ringback');
    return () => {
      stop();
      stopCallRing();
    };
  }, [activeCall.callId]);

  if (uiMinimized) {
    return (
      <ActiveCallMinimizedBarSimple
        activeCall={activeCall}
        onHangup={onCancel}
        hangupLabel="Отменить вызов"
      />
    );
  }

  return (
    <div className="call-window call-window--ringing" role="dialog" aria-label="Исходящий звонок">
      <MinimizeCallButton className="call-minimize-btn--overlay" />
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
                  void copyInviteShare(
                    activeCall.peerName?.trim() || 'Встреча',
                    absoluteInviteUrl(activeCall.inviteUrl!),
                  ).then((ok) => {
                    if (ok) emitAppToast('Название и ссылка скопированы', 'success');
                    else emitAppToast('Не удалось скопировать ссылку', 'error');
                  });
                }}
              >
                <IcCopy size={18} strokeWidth={2.2} aria-hidden />
                Скопировать ссылку
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="call-controls" role="toolbar" aria-label="Управление звонком">
        <button
          type="button"
          className="call-ctrl call-ctrl--hangup"
          onClick={() => {
            stopCallRing();
            onCancel();
          }}
          aria-label="Отменить"
        >
          <span className="call-ctrl__icon">
            <IcHangup size={22} />
          </span>
          <span className="call-ctrl__label">Отмена</span>
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
      {children}
      <div className="call-stage">
        <div className="call-stage__main">
          <div className="call-stage__avatar-block">
            <p className="call-stage__status">{status}</p>
          </div>
        </div>
      </div>
      <div className="call-controls" role="toolbar" aria-label="Управление звонком">
        <button type="button" className="call-ctrl call-ctrl--hangup" onClick={onHangup} aria-label="Завершить">
          <span className="call-ctrl__icon">
            <IcHangup size={22} />
          </span>
          <span className="call-ctrl__label">Выйти</span>
        </button>
      </div>
    </div>
  );
}

function CallWindowInner({ activeCall }: { activeCall: ActiveCallState }) {
  const closeCall = useCallStore((s) => s.closeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
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
  const preferMicOn = activeCall.initialMicOn !== false;
  const preferCamOn = videoEnabled && activeCall.initialCamOn !== false;
  const needsLiveKit =
    activeCall.status === 'active' ||
    (activeCall.callKind === 'group' && activeCall.status === 'calling');

  const hangup = useCallback(
    async (opts?: { endForAll?: boolean }) => {
      stopCallRing();
      try {
        if (activeCall.status === 'calling' && activeCall.isInitiator && !opts?.endForAll) {
          await cancelCall(activeCall.callId);
        } else {
          await endCall(activeCall.callId, opts?.endForAll ? { endForAll: true } : undefined);
        }
      } catch {
        /* ignore */
      }
      closeCall();
    },
    [activeCall.callId, activeCall.isInitiator, activeCall.status, closeCall],
  );

  useEffect(() => {
    if (activeCall.status === 'active' || activeCall.status === 'ended') {
      stopCallRing();
    }
  }, [activeCall.status]);

  // Best-effort leave when the tab closes — only for 1:1 / cancel ring.
  // Group meetings: no beacon /end — mobile background would kick host and kill the room.
  useEffect(() => {
    if (!needsLiveKit) return;
    if (activeCall.callKind === 'group' && activeCall.status !== 'calling') return;
    const onPageHide = () => {
      const body = JSON.stringify({});
      const url =
        activeCall.status === 'calling' && activeCall.isInitiator
          ? `/api/calls/${activeCall.callId}/cancel`
          : `/api/calls/${activeCall.callId}/end`;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        }
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [
    activeCall.callId,
    activeCall.callKind,
    activeCall.isInitiator,
    activeCall.status,
    needsLiveKit,
  ]);

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
        // ghost_cleanup во время ICE/reconnect раньше убивал UI встречи — игнор.
        // Реальное закрытие комнаты приходит как ROOM_DELETED / ended_by_moderator / all_left.
        if (m.type === 'call:ended' && m.reason === 'ghost_cleanup') {
          return;
        }
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
    // Не зависеть от status — иначе refetch/remount при active.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: callId + needsLiveKit only
  }, [activeCall.callId, needsLiveKit, setLiveKitCreds, setStatus]);

  const hadConnectedRef = useRef(false);
  useEffect(() => {
    if (lkConnected) hadConnectedRef.current = true;
  }, [lkConnected]);

  // LiveKit Room.connect ждёт и signal, и первый ICE — только для первого входа, не для reconnect.
  useEffect(() => {
    if (!creds?.token || !creds.url || connectError || lkConnected) return;
    if (hadConnectedRef.current) return;
    const t = window.setTimeout(() => {
      if (hadConnectedRef.current) return;
      setConnectError('Ошибка сервера или идут технические работы. Попробуйте позже.');
    }, 32_000);
    return () => window.clearTimeout(t);
  }, [creds?.token, creds?.url, connectError, lkConnected]);

  const isGroupCall = activeCall.callKind === 'group';
  const roomOptions = useMemo<RoomOptions>(
    () => ({
      // Группы: adaptive/dynacast снижают нагрузку при многих участниках.
      // 1:1: без них — стабильнее первое видео до жеста.
      adaptiveStream: isGroupCall,
      dynacast: isGroupCall,
      disconnectOnPageLeave: false,
      videoCaptureDefaults: {
        resolution: isGroupCall ? VideoPresets.h360.resolution : VideoPresets.h540.resolution,
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
        ...(isGroupCall ? { videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] } : {}),
      },
    }),
    [isGroupCall],
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
    if (uiMinimized) {
      return (
        <ActiveCallMinimizedBarSimple
          activeCall={activeCall}
          onHangup={() => void hangup()}
        />
      );
    }
    return (
      <CallShell onHangup={() => void hangup()} status={tokenError}>
        <MinimizeCallButton className="call-minimize-btn--overlay" />
      </CallShell>
    );
  }

  const roomToken = roomTokenRef.current;
  const roomUrl = roomUrlRef.current;
  if (!roomToken || !roomUrl) {
    if (uiMinimized) {
      return (
        <ActiveCallMinimizedBarSimple
          activeCall={activeCall}
          onHangup={() => void hangup()}
        />
      );
    }
    return (
      <CallShell onHangup={() => void hangup()} status="Получение доступа к комнате…">
        <MinimizeCallButton className="call-minimize-btn--overlay" />
      </CallShell>
    );
  }

  return (
    <div
      className={['call-window', uiMinimized ? 'call-window--minimized' : '']
        .filter(Boolean)
        .join(' ')}
      role={uiMinimized ? 'presentation' : 'dialog'}
      aria-label={uiMinimized ? undefined : 'Активный звонок'}
    >
      <LiveKitRoom
        key={activeCall.callId}
        token={roomToken}
        serverUrl={roomUrl}
        connect
        audio={preferMicOn}
        video={preferCamOn}
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
          // Hard end: room gone / kicked / duplicate. Transient drops → LiveKit reconnects.
          const roomClosed = (DisconnectReason as unknown as { ROOM_CLOSED?: number }).ROOM_CLOSED;
          const hardEnd =
            reason === DisconnectReason.ROOM_DELETED ||
            reason === DisconnectReason.PARTICIPANT_REMOVED ||
            reason === DisconnectReason.SERVER_SHUTDOWN ||
            reason === DisconnectReason.DUPLICATE_IDENTITY ||
            (roomClosed != null && reason === roomClosed);
          if (hardEnd) {
            emitAppToast(
              reason === DisconnectReason.DUPLICATE_IDENTITY
                ? 'Звонок открыт на другом устройстве'
                : 'Звонок завершён',
              'info',
            );
            closeCall();
          }
        }}
        className="call-lk-room"
      >
        <KeepAliveCallMedia />
        <ReportCallQuality callId={activeCall.callId} />
        <ApplyLobbyMediaPrefs micOn={preferMicOn} camOn={preferCamOn} videoEnabled={videoEnabled} />
        {uiMinimized ? (
          <>
            {/* RoomStage unmounted while minimized — keep remote audio alive. */}
            <RoomAudioRenderer />
            <StartAudio label="Нажмите, чтобы включить звук" className="call-start-audio" />
            <ActiveCallMinimizedBar activeCall={activeCall} onHangup={() => void hangup()} />
          </>
        ) : activeCall.callKind === 'group' ? (
          <GroupMeetingShell
            callId={activeCall.callId}
            videoEnabled={videoEnabled}
            callType={activeCall.callType}
            isHost={Boolean(activeCall.isInitiator)}
            connectError={connectError}
            onHangup={() => void hangup()}
            onEndForAll={() => void hangup({ endForAll: true })}
          />
        ) : (
          <>
            <MinimizeCallButton className="call-minimize-btn--overlay" />
            <RoomStage callType={activeCall.callType} connectError={connectError} />
            <CallControls videoEnabled={videoEnabled} onHangup={() => void hangup()} />
          </>
        )}
      </LiveKitRoom>
    </div>
  );
}

export function CallWindow() {
  const activeCall = useCallStore((s) => s.activeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
  const callUiExpanded = Boolean(
    activeCall &&
      activeCall.status !== 'ringing_in' &&
      activeCall.status !== 'ended' &&
      !uiMinimized,
  );

  useEffect(() => {
    if (!callUiExpanded) {
      setTelegramCallPresentation(false);
      return;
    }
    setTelegramCallPresentation(true);
    return () => setTelegramCallPresentation(false);
  }, [callUiExpanded]);

  // ringing_in: Accept UI lives on IncomingCallOverlay / CallPage — do not cover it.
  if (!activeCall) return null;
  if (activeCall.status === 'ringing_in' || activeCall.status === 'ended') return null;
  // BodyPortal: на iOS/Android #root короче viewport — иначе таббар (тоже в body) перекрывает кнопки.
  return (
    <BodyPortal>
      <CallWindowInner key={activeCall.callId} activeCall={activeCall} />
    </BodyPortal>
  );
}
