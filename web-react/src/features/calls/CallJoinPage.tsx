import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LuCircleAlert,
  LuMic,
  LuMicOff,
  LuUsers,
  LuUser,
  LuVideo,
  LuVideoOff,
} from 'react-icons/lu';

import { LOGIN_PATH } from '../../app/routeGuards';
import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';
import { isAppleMobileWeb, isInstalledPwa } from '../pwa/utils/pwaEnvironment';

import { joinInvitation, previewInvitation } from './callsApi';
import {
  GlassCallCta,
  GlassCallShell,
  GlassCallTitle,
} from './glassCallUi';
import { useCallStore } from './callStore';
import './calls.css';

function IosSafariPwaHint() {
  const show = isAppleMobileWeb() && !isInstalledPwa();
  if (!show) return null;
  return (
    <div className="glass-call__hint" role="note">
      <LuCircleAlert size={20} strokeWidth={1.8} aria-hidden />
      <p>
        Открыто в Safari. Если «Моя церковь» установлено с домашнего экрана — откройте приложение и
        нажмите ссылку на встречу в чате: так звонок останется в приложении, а не во вкладке
        браузера.
      </p>
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
      <GlassCallShell className="glass-call--simple" closeTo="/dashboard">
        <GlassCallTitle title="Вход во встречу" />
        <p className="glass-call__lead">Войдите в аккаунт, чтобы подключиться по ссылке.</p>
        <div className="glass-call__spacer" />
        <GlassCallCta to={`${LOGIN_PATH}?from=${encodeURIComponent(from)}`}>Войти</GlassCallCta>
      </GlassCallShell>
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
      <GlassCallShell className="glass-call--simple" closeTo="/messenger">
        <GlassCallTitle title="Не удалось войти" />
        <p className="glass-call__lead">{msg}</p>
        <div className="glass-call__spacer" />
        <GlassCallCta to="/messenger">В мессенджер</GlassCallCta>
      </GlassCallShell>
    );
  }

  if (!preview) {
    return (
      <GlassCallShell className="glass-call--simple" closeTo="/messenger">
        <p className="glass-call__lead glass-call__lead--solo">Проверка приглашения…</p>
        <div className="glass-call__spinner" aria-hidden />
      </GlassCallShell>
    );
  }

  const isVideo = preview.mediaType === 'video';
  const defaultTitle = isVideo ? 'Видеовстреча' : 'Аудиовстреча';
  const title = preview.conversationTitle?.trim() || defaultTitle;

  return (
    <GlassCallShell closeTo="/messenger">
      <div className={['glass-call__stage', camOn && isVideo ? 'is-live' : ''].filter(Boolean).join(' ')}>
        {preview.participantCount != null ? (
          <div className="glass-call__meta">
            <LuUsers size={17} strokeWidth={1.8} aria-hidden />
            Участников: {preview.participantCount}
          </div>
        ) : null}

        <div className={['glass-call__avatar', camOn && isVideo ? 'is-on' : 'is-off'].join(' ')} aria-hidden>
          {isVideo ? <LuVideo size={44} strokeWidth={1.6} /> : <LuUser size={44} strokeWidth={1.6} />}
        </div>

        <div className="glass-call__devices" role="group" aria-label="Устройства перед входом">
          <GlassDeviceToggle
            pressed={micOn}
            onClick={() => setMicOn((v) => !v)}
            labelOn="Микрофон вкл."
            labelOff="Микрофон выкл."
            iconOn={<LuMic size={24} strokeWidth={1.8} />}
            iconOff={<LuMicOff size={24} strokeWidth={1.8} />}
          />
          {isVideo ? (
            <GlassDeviceToggle
              pressed={camOn}
              onClick={() => setCamOn((v) => !v)}
              labelOn="Камера вкл."
              labelOff="Камера выкл."
              iconOn={<LuVideo size={24} strokeWidth={1.8} />}
              iconOff={<LuVideoOff size={24} strokeWidth={1.8} />}
            />
          ) : null}
        </div>
      </div>

      <GlassCallTitle title={title} />
      <p className="glass-call__lead">Вас пригласили подключиться по ссылке</p>
      <IosSafariPwaHint />

      <div className="glass-call__spacer" />

      <GlassCallCta
        disabled={!preview.canJoin || joining}
        onClick={() => void onJoin()}
        icon={
          isVideo ? (
            <LuVideo size={22} strokeWidth={1.8} aria-hidden />
          ) : (
            <LuMic size={22} strokeWidth={1.8} aria-hidden />
          )
        }
      >
        {joining ? 'Подключение…' : preview.canJoin ? 'Присоединиться' : 'Нет доступа'}
      </GlassCallCta>
    </GlassCallShell>
  );
}

function GlassDeviceToggle({
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
      className={['glass-call__device', pressed ? 'is-on' : 'is-off'].join(' ')}
      aria-pressed={pressed}
      aria-label={pressed ? labelOn : labelOff}
      onClick={onClick}
    >
      <span className="glass-call__device-icon" aria-hidden>
        {pressed ? iconOn : iconOff}
      </span>
      <span className="glass-call__device-cap">{pressed ? labelOn : labelOff}</span>
    </button>
  );
}
