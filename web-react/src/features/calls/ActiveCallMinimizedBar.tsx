import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { emitAppToast } from '../../lib/uiFeedback';

import { IcChevronsUp, IcPhone, IcVideo } from './callIcons';
import { mapDeviceError } from './callsApi';
import { unlockCallAudio } from './callRingtone';
import { useCallStore, type ActiveCallState, type MinimizedCallControls } from './callStore';
import { formatCallDuration, useCallElapsedSeconds } from './callTime';
import { MinimizedCallActions } from './MinimizedCallActions';

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
  controls: MinimizedCallControls;
  isMuted?: boolean;
  hangupLabel?: string;
};

/** Колбэки из CallWindow создаются заново на каждый рендер — отдаём в store стабильную обёртку. */
function useStableCallback(fn: () => void): () => void {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(() => ref.current(), []);
}

/** Публикует управление в store: из списка чатов звонком пользуется плашка `ActiveCallBanner`. */
function usePublishControls(controls: MinimizedCallControls) {
  const setMinimizedControls = useCallStore((s) => s.setMinimizedControls);
  useEffect(() => {
    setMinimizedControls(controls);
    return () => setMinimizedControls(null);
  }, [controls, setMinimizedControls]);
}

function ActiveCallBarChrome({ activeCall, controls, isMuted = false, hangupLabel }: BarProps) {
  const navigate = useNavigate();
  const expandCall = useCallStore((s) => s.expandCall);
  const elapsed = useCallElapsedSeconds(activeCall.startedAt);
  const avatarSrc = activeCall.peerAvatar ? resolvePublicUrl(activeCall.peerAvatar) : undefined;
  const { title, subtitle } = getCallMeta(activeCall);

  const onReturn = useCallback(() => {
    expandCall();
    void navigate(`/call/${encodeURIComponent(activeCall.callId)}`);
  }, [activeCall.callId, expandCall, navigate]);

  return (
    <div className="active-call-bar-host" role="region" aria-label="Активный звонок">
      <div className="active-call-bar">
        <button
          type="button"
          className="active-call-bar__main"
          onClick={onReturn}
          aria-label={`Вернуться в звонок: ${title}`}
        >
          <span className="active-call-bar__avatar" aria-hidden>
            {avatarSrc && activeCall.callKind === 'direct' ? (
              <img src={avatarSrc} alt="" className="active-call-bar__avatar-img" />
            ) : (
              <span className="active-call-bar__avatar-mark">
                {activeCall.callType === 'video' ? <IcVideo size={20} /> : <IcPhone size={20} />}
              </span>
            )}
          </span>
          <span className="active-call-bar__copy">
            <span className="active-call-bar__title">{title}</span>
            <span className="active-call-bar__meta">
              <span className="active-call-bar__live-dot" aria-hidden />
              <span className="active-call-bar__timer">{formatCallDuration(elapsed)}</span>
              <span className="active-call-bar__hint">· {subtitle}</span>
            </span>
          </span>
          <IcChevronsUp className="active-call-bar__chevron" size={18} aria-hidden />
        </button>
        <MinimizedCallActions
          controls={controls}
          isMuted={isMuted}
          tone="dark"
          hangupLabel={hangupLabel}
        />
      </div>
    </div>
  );
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
  const stableHangup = useStableCallback(onHangup);
  const controls = useMemo<MinimizedCallControls>(() => ({ hangup: stableHangup }), [stableHangup]);
  usePublishControls(controls);
  return <ActiveCallBarChrome activeCall={activeCall} controls={controls} hangupLabel={hangupLabel} />;
}

/** Inside LiveKitRoom — mic toggle + return + hangup. */
export function ActiveCallMinimizedBar({
  activeCall,
  onHangup,
}: {
  activeCall: ActiveCallState;
  onHangup: () => void;
}): ReactNode {
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

  const stableHangup = useStableCallback(onHangup);
  const stableToggleMic = useStableCallback(() => void toggleMic());
  const controls = useMemo<MinimizedCallControls>(
    () => ({ hangup: stableHangup, toggleMic: stableToggleMic, micBusy: mediaBusy }),
    [mediaBusy, stableHangup, stableToggleMic],
  );
  usePublishControls(controls);

  return <ActiveCallBarChrome activeCall={activeCall} controls={controls} isMuted={isMuted} />;
}
