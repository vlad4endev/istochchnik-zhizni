import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPhone, LuVideo } from 'react-icons/lu';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';

import { useCallStore } from './callStore';
import styles from './ActiveCallStoryChip.module.css';

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Stories-style ring in the chats list while a call is minimized —
 * tap returns to the LiveKit call UI.
 */
export function ActiveCallStoryChip() {
  const navigate = useNavigate();
  const activeCall = useCallStore((s) => s.activeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
  const expandCall = useCallStore((s) => s.expandCall);
  const [elapsed, setElapsed] = useState(0);

  const visible =
    Boolean(activeCall) &&
    uiMinimized &&
    activeCall!.status !== 'ended' &&
    activeCall!.status !== 'ringing_in';

  useEffect(() => {
    if (!visible) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [visible, activeCall?.callId]);

  const onReturn = useCallback(() => {
    const call = useCallStore.getState().activeCall;
    if (!call) return;
    expandCall();
    void navigate(`/call/${encodeURIComponent(call.callId)}`);
  }, [expandCall, navigate]);

  if (!visible || !activeCall) return null;

  const avatarSrc = activeCall.peerAvatar
    ? resolvePublicUrl(activeCall.peerAvatar)
    : undefined;
  const title =
    activeCall.peerName?.trim() ||
    (activeCall.callKind === 'group' ? 'Встреча' : 'Звонок');
  const shortTitle = title.length > 11 ? `${title.slice(0, 10)}…` : title;

  return (
    <div className={styles.bar} role="list" aria-label="Активный звонок">
      <button
        type="button"
        className={styles.item}
        role="listitem"
        onClick={onReturn}
        aria-label={`Вернуться в звонок: ${title}`}
      >
        <span className={styles.ring}>
          <span className={styles.avatarWrap}>
            {avatarSrc && activeCall.callKind === 'direct' ? (
              <img className={styles.avatarMedia} src={avatarSrc} alt="" />
            ) : (
              <span className={styles.avatarMark} aria-hidden>
                {activeCall.callType === 'video' ? (
                  <LuVideo size={22} strokeWidth={2.2} />
                ) : (
                  <LuPhone size={22} strokeWidth={2.2} />
                )}
              </span>
            )}
          </span>
          <span className={styles.liveDot} aria-hidden />
        </span>
        <span className={styles.label}>{shortTitle}</span>
        <span className={styles.sublabel}>
          {elapsed > 0 ? formatDuration(elapsed) : 'В звонке'}
        </span>
      </button>
    </div>
  );
}
