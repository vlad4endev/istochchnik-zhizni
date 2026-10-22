import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IcMic,
  IcMicOff,
  IcPhone,
  IcHangup,
  IcVideo,
} from './callIcons';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { emitAppToast } from '../../lib/uiFeedback';

import { mapDeviceError } from './callsApi';
import { unlockCallAudio } from './callRingtone';
import { useCallStore, type ActiveCallState } from './callStore';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getCallMeta(activeCall: ActiveCallState): { title: string; subtitle: string } {
  const title =
    activeCall.peerName?.trim() ||
    (activeCall.callKind === 'group' ? 'Встреча' : 'Звонок');
  const subtitle =
    activeCall.callType === 'video'
      ? activeCall.callKind === 'group'
        ? 'Видеовстреча'
        : 'Видеозвонок'
      : activeCall.callKind === 'group'
        ? 'Аудиовстреча'
        : 'Аудиозвонок';
  return { title, subtitle };
}

type BarProps = {
  activeCall: ActiveCallState;
  onHangup: () => void;
  elapsed: number;
  isMuted?: boolean;
  mediaBusy?: boolean;
  onToggleMic?: () => void;
  hangupLabel?: string;
};

function ActiveCallBarChrome({
  activeCall,
  onHangup,
  elapsed,
  isMuted = false,
  mediaBusy = false,
  onToggleMic,
  hangupLabel = 'Завершить звонок',
}: BarProps) {
  const navigate = useNavigate();
  const expandCall = useCallStore((s) => s.expandCall);
  const avatarSrc = activeCall.peerAvatar
    ? resolvePublicUrl(activeCall.peerAvatar)
    : undefined;
  const { title, subtitle } = getCallMeta(activeCall);

  const onReturn = useCallback(() => {
    expandCall();
    void navigate(`/call/${encodeURIComponent(activeCall.callId)}`);
  }, [activeCall.callId, expandCall, navigate]);

  return (
    <div className="active-call-bar-host" role="region" aria-label="Активный звонок">
      <button
        type="button"
        className="active-call-bar"
        onClick={onReturn}
        aria-label={`Вернуться в звонок: ${title}`}
      >
        <span className="active-call-bar__glow" aria-hidden />
        <span className="active-call-bar__pulse" aria-hidden />

        <span className="active-call-bar__avatar" aria-hidden>
          {avatarSrc && activeCall.callKind === 'direct' ? (
            <img src={avatarSrc} alt="" className="active-call-bar__avatar-img" />
          ) : (
            <span className="active-call-bar__avatar-mark">
              {activeCall.callType === 'video' ? (
                <IcVideo size={18} strokeWidth={2.2} />
              ) : (
                <IcPhone size={18} strokeWidth={2.2} />
              )}
            </span>
          )}
          <span className="active-call-bar__live-dot" />
        </span>

        <span className="active-call-bar__copy">
          <span className="active-call-bar__title">{title}</span>
          <span className="active-call-bar__meta">
            <span className="active-call-bar__live-label">В звонке</span>
            <span className="active-call-bar__dot" aria-hidden>
              ·
            </span>
            <span className="active-call-bar__timer">{formatDuration(elapsed)}</span>
            <span className="active-call-bar__dot active-call-bar__dot--wide" aria-hidden>
              ·
            </span>
            <span className="active-call-bar__hint">{subtitle} · нажмите, чтобы вернуться</span>
          </span>
        </span>

        <span className="active-call-bar__cta" aria-hidden>
          Вернуться
        </span>
      </button>

      <div className="active-call-bar__actions">
        {onToggleMic ? (
          <button
            type="button"
            className={[
              'active-call-bar__action',
              isMuted ? 'active-call-bar__action--warn' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMic();
            }}
            disabled={mediaBusy}
            aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          >
            {isMuted ? (
              <IcMicOff size={18} strokeWidth={2.3} />
            ) : (
              <IcMic size={18} strokeWidth={2.3} />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="active-call-bar__action active-call-bar__action--hangup"
          onClick={(e) => {
            e.stopPropagation();
            onHangup();
          }}
          aria-label={hangupLabel}
        >
          <IcHangup size={18} strokeWidth={2.3} />
        </button>
      </div>
    </div>
  );
}

function useElapsed(callId: string): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(t);
  }, [callId]);
  return elapsed;
}

/** Outside LiveKit (outgoing ring / loading) — return + hangup only. */
export function ActiveCallMinimizedBarSimple({
  activeCall,
  onHangup,
  hangupLabel,
}: {
  activeCall: ActiveCallState;
  onHangup: () => void;
  hangupLabel?: string;
}) {
  const elapsed = useElapsed(activeCall.callId);
  return (
    <ActiveCallBarChrome
      activeCall={activeCall}
      onHangup={onHangup}
      elapsed={elapsed}
      hangupLabel={hangupLabel}
    />
  );
}

/** Inside LiveKitRoom — mic toggle + return + hangup. */
export function ActiveCallMinimizedBar({
  activeCall,
  onHangup,
}: {
  activeCall: ActiveCallState;
  onHangup: () => void;
}): ReactNode {
  const elapsed = useElapsed(activeCall.callId);
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const setMuted = useCallStore((s) => s.setMuted);
  const [mediaBusy, setMediaBusy] = useState(false);
  const isMuted = !isMicrophoneEnabled;

  useEffect(() => {
    unlockCallAudio();
    void room.startAudio().catch(() => undefined);
  }, [room]);

  useEffect(() => {
    setMuted(isMuted);
  }, [isMuted, setMuted]);

  const toggleMic = useCallback(async () => {
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      unlockCallAudio();
      void room.startAudio().catch(() => undefined);
      await localParticipant.setMicrophoneEnabled(isMuted);
    } catch (e) {
      emitAppToast(mapDeviceError(e), 'error');
    } finally {
      setMediaBusy(false);
    }
  }, [isMuted, localParticipant, mediaBusy, room]);

  return (
    <ActiveCallBarChrome
      activeCall={activeCall}
      onHangup={onHangup}
      elapsed={elapsed}
      isMuted={isMuted}
      mediaBusy={mediaBusy}
      onToggleMic={() => void toggleMic()}
    />
  );
}
