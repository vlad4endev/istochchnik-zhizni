import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LuBan,
  LuCircleAlert,
  LuClock,
  LuLink2Off,
  LuLock,
  LuLogIn,
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
  GlassCallStatus,
  GlassCallTitle,
} from './glassCallUi';
import { meetingTitleFromPreview } from './meetingTitle';
import { useCallStore } from './callStore';
import './calls.css';

function IosSafariPwaHint() {
  const show = isAppleMobileWeb() && !isInstalledPwa();
  if (!show) return null;
  return (
    <div className="glass-call__hint" role="note">
      <LuCircleAlert size={18} strokeWidth={1.8} aria-hidden />
      <p>
        Открыто в Safari. Для стабильного звонка откройте ссылку из приложения «Моя церковь» на
        домашнем экране.
      </p>
    </div>
  );
}

interface InviteProblem {
  icon: ReactNode;
  title: string;
  lead: string;
}

/** Понятное объяснение, почему ссылка не открылась, и что делать дальше. */
function describeInviteProblem(reason: string | undefined, fallback?: string | null): InviteProblem {
  const size = 40;
  switch (reason) {
    case 'call_ended':
      return {
        icon: <LuVideoOff size={size} strokeWidth={1.5} />,
        title: 'Встреча завершена',
        lead: 'Организатор уже закончил эту встречу. Попросите у него новую ссылку или загляните в мессенджер — возможно, встреча уже идёт в другой комнате.',
      };
    case 'expired':
      return {
        icon: <LuClock size={size} strokeWidth={1.5} />,
        title: 'Ссылка устарела',
        lead: 'Срок действия приглашения истёк. Попросите организатора прислать свежую ссылку.',
      };
    case 'revoked':
      return {
        icon: <LuBan size={size} strokeWidth={1.5} />,
        title: 'Приглашение отозвано',
        lead: 'Организатор закрыл эту ссылку. Если вам нужно подключиться, попросите новую.',
      };
    case 'no_group_access':
      return {
        icon: <LuLock size={size} strokeWidth={1.5} />,
        title: 'Нет доступа',
        lead: 'Эта встреча открыта только для участников определённой группы. Если вы должны на неё попасть, обратитесь к организатору или лидеру группы.',
      };
    case 'exhausted':
      return {
        icon: <LuLink2Off size={size} strokeWidth={1.5} />,
        title: 'Лимит исчерпан',
        lead: 'Ссылкой уже воспользовалось максимальное число участников. Попросите организатора создать новое приглашение.',
      };
    default:
      return {
        icon: <LuLink2Off size={size} strokeWidth={1.5} />,
        title: 'Ссылка не работает',
        lead: fallback && fallback !== 'Приглашение недействительно'
          ? fallback
          : 'Приглашение недействительно или было удалено. Проверьте, что ссылка скопирована полностью, или запросите новую.',
      };
  }
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
      const title = meetingTitleFromPreview(preview, result.call.title ?? undefined);
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

  if (!preview && !error) {
    return (
      <GlassCallStatus
        tone="loading"
        title="Проверяем приглашение"
        lead="Секунду — подготавливаем вход во встречу."
        closeTo={isAuthenticated ? '/messenger' : '/dashboard'}
      />
    );
  }

  if (!isAuthenticated) {
    const from = `/call/join/${encodeURIComponent(inviteToken)}`;
    const inviteTitle =
      preview && preview.valid ? meetingTitleFromPreview(preview) : 'Вход во встречу';
    const hasTitle = preview?.valid === true;
    return (
      <GlassCallStatus
        icon={<LuLogIn size={40} strokeWidth={1.5} />}
        chip={hasTitle ? inviteTitle : undefined}
        title="Войдите, чтобы присоединиться"
        lead="Вас пригласили на встречу. Войдите в свой аккаунт — после этого вы сразу вернётесь к этой встрече."
        closeTo="/dashboard"
        primary={{ label: 'Войти', to: `${LOGIN_PATH}?from=${encodeURIComponent(from)}` }}
      />
    );
  }

  if (error || (preview && !preview.valid)) {
    const problem = describeInviteProblem(preview?.reason, error);
    return (
      <GlassCallStatus
        tone="error"
        icon={problem.icon}
        title={problem.title}
        lead={problem.lead}
        closeTo="/messenger"
        primary={{ label: 'В мессенджер', to: '/messenger' }}
        secondary={{ label: 'На главную', to: '/dashboard' }}
      />
    );
  }

  if (!preview || !preview.valid) {
    const problem = describeInviteProblem(undefined, error);
    return (
      <GlassCallStatus
        tone="error"
        icon={problem.icon}
        title={problem.title}
        lead={problem.lead}
        closeTo="/messenger"
        primary={{ label: 'В мессенджер', to: '/messenger' }}
        secondary={{ label: 'На главную', to: '/dashboard' }}
      />
    );
  }

  const isVideo = preview.mediaType === 'video';
  // Template name («Вечерняя молитвенная стража») or custom meeting title from create dialog.
  const title = meetingTitleFromPreview(preview);

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
            labelOn="Микрофон"
            labelOff="Микрофон"
            iconOn={<LuMic size={24} strokeWidth={1.8} />}
            iconOff={<LuMicOff size={24} strokeWidth={1.8} />}
          />
          {isVideo ? (
            <GlassDeviceToggle
              pressed={camOn}
              onClick={() => setCamOn((v) => !v)}
              labelOn="Камера"
              labelOff="Камера"
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
      aria-label={pressed ? `${labelOn} включён` : `${labelOff} выключен`}
      onClick={onClick}
    >
      <span className="glass-call__device-icon" aria-hidden>
        {pressed ? iconOn : iconOff}
      </span>
      <span className="glass-call__device-cap">{pressed ? labelOn : labelOff}</span>
    </button>
  );
}
