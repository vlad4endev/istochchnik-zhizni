import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';

import { requestCallNotificationsFromUserGesture } from './incomingCallBackground';
import { useIncomingCall } from './useIncomingCall';
import './calls.css';

export function IncomingCallToast() {
  const navigate = useNavigate();
  const { incomingCall, accept, reject } = useIncomingCall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const titleBlinkTimerRef = useRef<number | null>(null);
  const savedTitleRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const tryPlayRing = () => {
    const el = audioRef.current;
    if (!el) return;
    void el.play().catch(() => {
      /* фон / автовоспроизведение */
    });
  };

  useEffect(() => {
    const onNotifClick = () => {
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
  }, [incomingCall]);

  if (!incomingCall) return null;

  const avatarSrc = incomingCall.callerAvatar
    ? resolvePublicUrl(incomingCall.callerAvatar)
    : undefined;

  const onReject = () => {
    requestCallNotificationsFromUserGesture();
    reject();
  };

  const onAccept = () => {
    requestCallNotificationsFromUserGesture();
    accept();
  };

  return (
    <div className="incoming-call-toast" role="dialog" aria-label="Входящий звонок">
      <audio ref={audioRef} src="/sounds/ringtone.mp3" loop preload="auto" />

      <div className="caller-info">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="caller-avatar" />
        ) : (
          <div className="caller-avatar bg-stone-300" aria-hidden />
        )}
        <div>
          <p className="caller-name">{incomingCall.callerName}</p>
          <p className="call-type">
            {incomingCall.callType === 'video' ? 'Видеозвонок' : 'Аудиозвонок'}
          </p>
        </div>
      </div>

      <div className="call-actions">
        <button type="button" className="btn-reject" onClick={onReject}>
          Отклонить
        </button>
        <button type="button" className="btn-accept" onClick={onAccept}>
          Принять
        </button>
      </div>
    </div>
  );
}
