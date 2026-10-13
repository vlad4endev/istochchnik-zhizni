import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuArrowLeft, LuMic, LuMicOff, LuUsers, LuVideo, LuVideoOff } from 'react-icons/lu';

import { LOGIN_PATH } from '../../app/routeGuards';
import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';

import { joinInvitation, previewInvitation } from './callsApi';
import { useCallStore } from './callStore';
import './calls.css';

function CallJoinShell({
  children,
  mediaType = 'audio',
}: {
  children: ReactNode;
  mediaType?: 'audio' | 'video';
}) {
  return (
    <div className={['call-join', mediaType === 'video' ? 'call-join--video' : ''].join(' ')}>
      <div className="call-join__atmosphere" aria-hidden>
        <span className="call-join__orb call-join__orb--a" />
        <span className="call-join__orb call-join__orb--b" />
        <span className="call-join__orb call-join__orb--c" />
        <span className="call-join__grain" />
      </div>
      <div className="call-join__frame">{children}</div>
    </div>
  );
}

export function CallJoinPage() {
  const { inviteToken = '' } = useParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => Boolean(s.token || s.memberId));
  const hydrateFromPublic = useCallStore((s) => s.hydrateFromPublic);
  const setLiveKitCreds = useCallStore((s) => s.setLiveKitCreds);

  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewInvitation>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    void previewInvitation(inviteToken)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setError('Приглашение недействительно');
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  if (!isAuthenticated) {
    const from = `/call/join/${encodeURIComponent(inviteToken)}`;
    return (
      <CallJoinShell>
        <p className="call-join__brand">Источник жизни</p>
        <div className="call-join__mark" aria-hidden>
          <span className="call-join__pulse" />
          <span className="call-join__pulse call-join__pulse--late" />
          <span className="call-join__mark-core">
            <LuUsers size={36} strokeWidth={1.75} />
          </span>
        </div>
        <h1 className="call-join__title">Вход в конференцию</h1>
        <p className="call-join__lead">Войдите в аккаунт, чтобы подключиться к звонку.</p>
        <Link className="call-join__cta" to={`${LOGIN_PATH}?from=${encodeURIComponent(from)}`}>
          Войти
        </Link>
      </CallJoinShell>
    );
  }

  if (error || (preview && !preview.valid)) {
    const reason = preview?.reason;
    const msg =
      reason === 'expired'
        ? 'Срок приглашения истёк'
        : reason === 'revoked'
          ? 'Приглашение отозвано'
          : reason === 'call_ended'
            ? 'Конференция завершена'
            : reason === 'no_group_access'
              ? 'Нет доступа к этой группе'
              : reason === 'exhausted'
                ? 'Лимит использований приглашения исчерпан'
                : error || 'Приглашение недействительно';
    return (
      <CallJoinShell>
        <p className="call-join__brand">Источник жизни</p>
        <h1 className="call-join__title">Не удалось войти</h1>
        <p className="call-join__lead">{msg}</p>
        <Link to="/messenger" className="call-join__ghost">
          <LuArrowLeft size={18} aria-hidden />
          В мессенджер
        </Link>
      </CallJoinShell>
    );
  }

  if (!preview) {
    return (
      <CallJoinShell>
        <p className="call-join__brand">Источник жизни</p>
        <div className="call-join__mark call-join__mark--loading" aria-hidden>
          <span className="call-join__pulse" />
          <span className="call-join__mark-core" />
        </div>
        <p className="call-join__lead">Проверка приглашения…</p>
      </CallJoinShell>
    );
  }

  const onJoin = async () => {
    setJoining(true);
    try {
      if (micOn || camOn) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: micOn,
            video: camOn && preview.mediaType === 'video',
          });
          stream.getTracks().forEach((t) => t.stop());
        } catch (e) {
          emitAppToast(
            e instanceof Error && e.name === 'NotAllowedError'
              ? 'Нет доступа к микрофону или камере'
              : 'Не удалось получить доступ к устройствам',
            'error',
          );
          setJoining(false);
          return;
        }
      }
      const result = await joinInvitation(inviteToken);
      hydrateFromPublic(result.call, {
        peerName: preview.conversationTitle || 'Конференция',
        peerAvatar: '',
        peerId: 0,
        isInitiator: false,
        status: 'active',
        livekitUrl: result.url,
        livekitToken: result.token,
      });
      setLiveKitCreds(result.url, result.token);
      void navigate(`/call/${result.call.id}`, { replace: true });
    } catch (e) {
      emitAppToast(e instanceof Error ? e.message : 'Ошибка подключения', 'error');
    } finally {
      setJoining(false);
    }
  };

  const isVideo = preview.mediaType === 'video';
  const headline = isVideo ? 'Видеоконференция' : 'Аудиоконференция';
  const metaParts = [
    preview.conversationTitle?.trim() || null,
    preview.participantCount != null ? `${preview.participantCount} в эфире` : null,
  ].filter(Boolean);

  return (
    <CallJoinShell mediaType={preview.mediaType}>
      <p className="call-join__brand">Источник жизни</p>

      <div className="call-join__mark" aria-hidden>
        <span className="call-join__pulse" />
        <span className="call-join__pulse call-join__pulse--late" />
        <span className="call-join__mark-core">
          {isVideo ? <LuVideo size={36} strokeWidth={1.75} /> : <LuMic size={36} strokeWidth={1.75} />}
        </span>
      </div>

      <h1 className="call-join__title">{headline}</h1>
      {metaParts.length > 0 ? (
        <p className="call-join__lead">
          {metaParts.join(' · ')}
        </p>
      ) : (
        <p className="call-join__lead">Подключитесь, когда будете готовы.</p>
      )}

      <div className="call-join__devices" role="group" aria-label="Устройства">
        <button
          type="button"
          className={['call-join__device', micOn ? 'is-on' : 'is-off'].join(' ')}
          aria-pressed={micOn}
          onClick={() => setMicOn((v) => !v)}
        >
          <span className="call-join__device-icon" aria-hidden>
            {micOn ? <LuMic size={22} strokeWidth={2} /> : <LuMicOff size={22} strokeWidth={2} />}
          </span>
          <span className="call-join__device-label">{micOn ? 'Микрофон вкл.' : 'Микрофон выкл.'}</span>
        </button>
        {isVideo ? (
          <button
            type="button"
            className={['call-join__device', camOn ? 'is-on' : 'is-off'].join(' ')}
            aria-pressed={camOn}
            onClick={() => setCamOn((v) => !v)}
          >
            <span className="call-join__device-icon" aria-hidden>
              {camOn ? <LuVideo size={22} strokeWidth={2} /> : <LuVideoOff size={22} strokeWidth={2} />}
            </span>
            <span className="call-join__device-label">{camOn ? 'Камера вкл.' : 'Камера выкл.'}</span>
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="call-join__cta"
        disabled={!preview.canJoin || joining}
        onClick={() => void onJoin()}
      >
        {joining ? 'Подключение…' : preview.canJoin ? 'Подключиться' : 'Нет доступа'}
      </button>

      <Link to="/messenger" className="call-join__ghost">
        <LuArrowLeft size={18} aria-hidden />
        В мессенджер
      </Link>
    </CallJoinShell>
  );
}
