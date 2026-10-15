import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuMic, LuMicOff, LuUsers, LuVideo, LuVideoOff } from 'react-icons/lu';

import { LOGIN_PATH } from '../../app/routeGuards';
import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';
import { isAppleMobileWeb, isInstalledPwa } from '../pwa/utils/pwaEnvironment';

import { joinInvitation, previewInvitation } from './callsApi';
import { MeetingAvatar } from './MeetingAvatar';
import { useCallStore } from './callStore';
import './calls.css';

function IosSafariPwaHint() {
  const show = isAppleMobileWeb() && !isInstalledPwa();
  if (!show) return null;
  return (
    <p className="telemost-join__pwa-hint" role="note">
      Открыто в Safari. Если «Моя церковь» установлено с домашнего экрана — откройте приложение и
      нажмите ссылку на встречу в чате: так звонок останется в приложении, а не во вкладке браузера.
    </p>
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
        if (!cancelled) {
          setPreview(p);
          if (p.mediaType === 'audio') setCamOn(false);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Приглашение недействительно');
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const onJoin = useCallback(async () => {
    if (!preview || joining) return;
    setJoining(true);
    try {
      const isVideo = preview.mediaType === 'video';
      if (micOn || (isVideo && camOn)) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: micOn,
            video: isVideo && camOn,
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
      const title =
        result.call.title?.trim() ||
        preview.conversationTitle?.trim() ||
        (preview.mediaType === 'video' ? 'Видеовстреча' : 'Аудиовстреча');
      // Link joins must not deep-link into the host chat: invitees are call participants,
      // not conversation members → otherwise messenger returns «Not a member of this conversation».
      hydrateFromPublic(result.call, {
        peerName: title,
        peerAvatar: '',
        peerId: 0,
        isInitiator: false,
        status: 'active',
        conversationId: '',
        livekitUrl: result.url,
        livekitToken: result.token,
        initialMicOn: micOn,
        initialCamOn: isVideo && camOn,
      });
      setLiveKitCreds(result.url, result.token);
      void navigate(`/call/${result.call.id}`, { replace: true });
    } catch (e) {
      emitAppToast(e instanceof Error ? e.message : 'Ошибка подключения', 'error');
    } finally {
      setJoining(false);
    }
  }, [camOn, hydrateFromPublic, inviteToken, joining, micOn, navigate, preview, setLiveKitCreds]);

  if (!isAuthenticated) {
    const from = `/call/join/${encodeURIComponent(inviteToken)}`;
    return (
      <div className="telemost-join" role="main">
        <div className="telemost-join__atmosphere" aria-hidden>
          <span className="telemost-join__glow telemost-join__glow--a" />
          <span className="telemost-join__glow telemost-join__glow--b" />
        </div>
        <div className="telemost-join__panel">
          <p className="telemost-join__eyebrow">Источник жизни · встречи</p>
          <MeetingAvatar mediaType="video" size="md" />
          <h1 className="telemost-join__title">Вход во встречу</h1>
          <p className="telemost-join__lead">Войдите в аккаунт, чтобы подключиться по ссылке.</p>
          <Link className="telemost-join__cta" to={`${LOGIN_PATH}?from=${encodeURIComponent(from)}`}>
            Войти
          </Link>
        </div>
      </div>
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
            ? 'Встреча уже завершена'
            : reason === 'no_group_access'
              ? 'Нет доступа к этой встрече'
              : reason === 'exhausted'
                ? 'Лимит использований приглашения исчерпан'
                : error || 'Приглашение недействительно';
    return (
      <div className="telemost-join" role="main">
        <div className="telemost-join__atmosphere" aria-hidden>
          <span className="telemost-join__glow telemost-join__glow--a" />
          <span className="telemost-join__glow telemost-join__glow--b" />
        </div>
        <div className="telemost-join__panel">
          <p className="telemost-join__eyebrow">Источник жизни · встречи</p>
          <h1 className="telemost-join__title">Не удалось войти</h1>
          <p className="telemost-join__lead">{msg}</p>
          <Link className="telemost-join__cta telemost-join__cta--ghost" to="/messenger">
            В мессенджер
          </Link>
        </div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="telemost-join" role="main">
        <div className="telemost-join__atmosphere" aria-hidden>
          <span className="telemost-join__glow telemost-join__glow--a" />
          <span className="telemost-join__glow telemost-join__glow--b" />
        </div>
        <div className="telemost-join__panel">
          <p className="telemost-join__lead">Проверка приглашения…</p>
        </div>
      </div>
    );
  }

  const isVideo = preview.mediaType === 'video';
  const defaultTitle = isVideo ? 'Видеовстреча' : 'Аудиовстреча';
  const title = preview.conversationTitle?.trim() || defaultTitle;
  const subtitle = 'Вас пригласили подключиться по ссылке';

  return (
    <div className="telemost-join" role="main">
      <div className="telemost-join__atmosphere" aria-hidden>
        <span className="telemost-join__glow telemost-join__glow--a" />
        <span className="telemost-join__glow telemost-join__glow--b" />
      </div>

      <div className="telemost-join__panel">
        <p className="telemost-join__eyebrow">Источник жизни · встречи</p>
        <MeetingAvatar mediaType={isVideo ? 'video' : 'audio'} size="lg" />

        <h1 className="telemost-join__title">{title}</h1>
        <p className="telemost-join__lead">{subtitle}</p>
        <IosSafariPwaHint />

        {preview.participantCount != null ? (
          <p className="telemost-join__meta">
            <LuUsers size={16} strokeWidth={2.2} aria-hidden />
            Участников: {preview.participantCount}
          </p>
        ) : null}

        <div className="telemost-join__devices" role="group" aria-label="Устройства перед входом">
          <DeviceToggle
            pressed={micOn}
            onClick={() => setMicOn((v) => !v)}
            labelOn="Микрофон"
            labelOff="Микрофон выкл."
            iconOn={<LuMic size={20} strokeWidth={2.1} />}
            iconOff={<LuMicOff size={20} strokeWidth={2.1} />}
          />
          {isVideo ? (
            <DeviceToggle
              pressed={camOn}
              onClick={() => setCamOn((v) => !v)}
              labelOn="Камера"
              labelOff="Камера выкл."
              iconOn={<LuVideo size={20} strokeWidth={2.1} />}
              iconOff={<LuVideoOff size={20} strokeWidth={2.1} />}
            />
          ) : null}
        </div>

        <button
          type="button"
          className="telemost-join__cta"
          disabled={!preview.canJoin || joining}
          onClick={() => void onJoin()}
        >
          {joining ? 'Подключение…' : preview.canJoin ? 'Подключиться' : 'Нет доступа'}
        </button>
      </div>
    </div>
  );
}

function DeviceToggle({
  pressed,
  onClick,
  labelOn,
  labelOff,
  iconOn,
  iconOff,
}: {
  pressed: boolean;
  onClick: () => void;
  labelOn: string;
  labelOff: string;
  iconOn: ReactNode;
  iconOff: ReactNode;
}) {
  return (
    <button
      type="button"
      className={['telemost-join__device', pressed ? 'is-on' : 'is-off'].join(' ')}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="telemost-join__device-icon" aria-hidden>
        {pressed ? iconOn : iconOff}
      </span>
      <span>{pressed ? labelOn : labelOff}</span>
    </button>
  );
}
