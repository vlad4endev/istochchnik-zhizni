import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';

import { startCallRing, stopCallRing, unlockCallAudio } from './callRingtone';
import { requestCallNotificationsFromUserGesture } from './incomingCallBackground';
import { useIncomingCall } from './useIncomingCall';
import './calls.css';

/** Полноэкранный входящий — в духе системного CallKit / макета. */
export function IncomingCallOverlay() {
  const navigate = useNavigate();
  const { incomingCall, accept, reject, suppressWebRingtone } = useIncomingCall();
  const stopRingRef = useRef<(() => void) | null>(null);
  const titleBlinkTimerRef = useRef<number | null>(null);
  const savedTitleRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

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
      stopRingRef.current?.();
      stopRingRef.current = null;
      stopCallRing();
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

    if (!suppressWebRingtone) {
      unlockCallAudio();
      stopRingRef.current?.();
      stopRingRef.current = startCallRing('ringtone');
    } else {
      stopRingRef.current?.();
      stopRingRef.current = null;
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
      if (document.visibilityState === 'visible' && !suppressWebRingtone && incomingCall) {
        unlockCallAudio();
        stopRingRef.current?.();
        stopRingRef.current = startCallRing('ringtone');
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stopRingRef.current?.();
      stopRingRef.current = null;
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
  }, [incomingCall, suppressWebRingtone]);

  if (!incomingCall) return null;

  const avatarSrc = incomingCall.callerAvatar
    ? resolvePublicUrl(incomingCall.callerAvatar)
    : undefined;
  const isVideo = incomingCall.callType === 'video';
  const initial = (incomingCall.callerName || '?').trim().charAt(0).toUpperCase() || '?';

  const onReject = () => {
    unlockCallAudio();
    requestCallNotificationsFromUserGesture();
    stopCallRing();
    void reject();
  };

  const onAccept = () => {
    unlockCallAudio();
    requestCallNotificationsFromUserGesture();
    stopCallRing();
    void accept();
  };

  const onMessage = () => {
    unlockCallAudio();
    requestCallNotificationsFromUserGesture();
    stopCallRing();
    const conversationId = incomingCall.conversationId;
    void reject().then(() => {
      if (conversationId) {
        void navigate(`/messenger?conversationId=${encodeURIComponent(conversationId)}`);
      } else {
        void navigate('/messenger');
      }
    });
  };

  return (
    <div
      className={[
        'incoming-call-overlay',
        isVideo ? 'incoming-call-overlay--video' : 'incoming-call-overlay--audio',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Входящий звонок"
      onPointerDown={unlockCallAudio}
    >
      {isVideo && avatarSrc ? (
        <div
          className="incoming-call-overlay__photo-bg"
          style={{ backgroundImage: `url(${avatarSrc})` }}
          aria-hidden
        />
      ) : (
        <div className="incoming-call-overlay__wave-bg" aria-hidden>
          <span className="incoming-call-overlay__wave incoming-call-overlay__wave--1" />
          <span className="incoming-call-overlay__wave incoming-call-overlay__wave--2" />
          <span className="incoming-call-overlay__wave incoming-call-overlay__wave--3" />
        </div>
      )}
      <div className="incoming-call-overlay__scrim" aria-hidden />

      <div className="incoming-call-overlay__body">
        {!isVideo || !avatarSrc ? (
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
        ) : null}

        <h1 className="incoming-call-overlay__name">{incomingCall.callerName}</h1>
        <p className="incoming-call-overlay__hint">{isVideo ? 'Видеозвонок' : 'Аудиозвонок'}</p>
      </div>

      <div className="incoming-call-overlay__footer">
        {incomingCall.conversationId ? (
          <div className="incoming-call-overlay__secondary">
            <button type="button" className="incoming-call-overlay__secondary-btn" onClick={onMessage}>
              <span className="incoming-call-overlay__secondary-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                </svg>
              </span>
              <span>Сообщение</span>
            </button>
          </div>
        ) : null}

        <div className="incoming-call-overlay__actions">
          <button
            type="button"
            className="incoming-call-overlay__btn incoming-call-overlay__btn--reject"
            onClick={onReject}
          >
            <span className="incoming-call-overlay__btn-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
                <path
                  d="M3 3l18 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="incoming-call-overlay__btn-label">Отклонить</span>
          </button>
          <button
            type="button"
            className="incoming-call-overlay__btn incoming-call-overlay__btn--accept"
            onClick={onAccept}
          >
            <span className="incoming-call-overlay__btn-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z" />
              </svg>
            </span>
            <span className="incoming-call-overlay__btn-label">Ответить</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated Используйте IncomingCallOverlay */
export { IncomingCallOverlay as IncomingCallToast };
