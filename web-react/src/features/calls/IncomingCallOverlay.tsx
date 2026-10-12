import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';

import { requestCallNotificationsFromUserGesture } from './incomingCallBackground';
import { useIncomingCall } from './useIncomingCall';
import './calls.css';

/** Полноэкранный входящий звонок (foreground WebView). */
export function IncomingCallOverlay() {
  const navigate = useNavigate();
  const { incomingCall, accept, reject, suppressWebRingtone } = useIncomingCall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const titleBlinkTimerRef = useRef<number | null>(null);
  const savedTitleRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const tryPlayRing = () => {
    if (suppressWebRingtone) return;
    const el = audioRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* фон / автовоспроизведение */
    });
  };

  useEffect(() => {
    const onNotifClick = (ev: Event) => {
      const detail = (ev as CustomEvent<{ callId?: string }>).detail;
      if (detail?.callId) {
        void navigate(`/call/${detail.callId}`);
        return;
      }
      void navigate('/messenger');
    };
    window.addEventListener('calls:incoming-notification-click', onNotifClick);
    return () => window.removeEventListener('calls:incoming-notification-click', onNotifClick);
  }, [navigate]);

  useEffect(() => {
    if (!incomingCall) {
      audioRef.current?.pause();
      if (titleBlinkTimerRef.current != null) {
        window.clearInterval(titleBlinkTimerRef.current);
        titleBlinkTimerRef.current = null;
      }
      if (savedTitleRef.current != null) {
        document.title = savedTitleRef.current;
        savedTitleRef.current = null;
      }
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }

    tryPlayRing();

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }
    } catch {
      /* ignore */
    }

    if (document.visibilityState === 'hidden' && savedTitleRef.current == null) {
      savedTitleRef.current = document.title;
      let on = false;
      const base = incomingCall.callerName || 'Звонок';
      titleBlinkTimerRef.current = window.setInterval(() => {
        on = !on;
        document.title = on ? `📞 ${base}` : (savedTitleRef.current ?? '');
      }, 900);
    }

    if ('wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function') {
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      void navigator.wakeLock
        .request('screen')
        .then((lock) => {
          wakeLockRef.current = lock;
        })
        .catch(() => {
          /* нет поддержки или запрет */
        });
    }

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        tryPlayRing();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tryPlayRing);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tryPlayRing);
      if (titleBlinkTimerRef.current != null) {
        window.clearInterval(titleBlinkTimerRef.current);
        titleBlinkTimerRef.current = null;
      }
      if (savedTitleRef.current != null) {
        document.title = savedTitleRef.current;
        savedTitleRef.current = null;
      }
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ring helpers close over suppressWebRingtone
  }, [incomingCall, suppressWebRingtone]);

  if (!incomingCall) return null;

  const avatarSrc = incomingCall.callerAvatar
    ? resolvePublicUrl(incomingCall.callerAvatar)
    : undefined;
  const isVideo = incomingCall.callType === 'video';
  const initial = (incomingCall.callerName || '?').trim().charAt(0).toUpperCase() || '?';

  const onReject = () => {
    requestCallNotificationsFromUserGesture();
    void reject();
  };

  const onAccept = () => {
    requestCallNotificationsFromUserGesture();
    void accept();
  };

  return (
    <div className="incoming-call-overlay" role="dialog" aria-modal="true" aria-label="Входящий звонок">
      {!suppressWebRingtone ? (
        <audio ref={audioRef} src="/sounds/ringtone.mp3" loop preload="auto" />
      ) : null}

      <div className="incoming-call-overlay__glow" aria-hidden />

      <div className="incoming-call-overlay__body">
        <p className="incoming-call-overlay__label">
          {isVideo ? 'Входящий видеозвонок' : 'Входящий звонок'}
        </p>

        <div className="incoming-call-overlay__avatar-wrap">
          <span className="incoming-call-overlay__pulse" aria-hidden />
          <span className="incoming-call-overlay__pulse incoming-call-overlay__pulse--delayed" aria-hidden />
          {avatarSrc ? (
            <img src={avatarSrc} alt="" className="incoming-call-overlay__avatar" />
          ) : (
            <div className="incoming-call-overlay__avatar incoming-call-overlay__avatar--placeholder" aria-hidden>
              {initial}
            </div>
          )}
        </div>

        <h1 className="incoming-call-overlay__name">{incomingCall.callerName}</h1>
        <p className="incoming-call-overlay__hint">{isVideo ? 'Видеозвонок' : 'Аудиозвонок'}</p>
      </div>

      <div className="incoming-call-overlay__actions">
        <button type="button" className="incoming-call-overlay__btn incoming-call-overlay__btn--reject" onClick={onReject}>
          <span className="incoming-call-overlay__btn-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </span>
          <span className="incoming-call-overlay__btn-label">Отклонить</span>
        </button>
        <button type="button" className="incoming-call-overlay__btn incoming-call-overlay__btn--accept" onClick={onAccept}>
          <span className="incoming-call-overlay__btn-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
            </svg>
          </span>
          <span className="incoming-call-overlay__btn-label">Принять</span>
        </button>
      </div>
    </div>
  );
}

/** @deprecated Используйте IncomingCallOverlay */
export { IncomingCallOverlay as IncomingCallToast };
