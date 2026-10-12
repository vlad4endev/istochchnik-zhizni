import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { LOGIN_PATH } from '../../app/routeGuards';
import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';

import { joinInvitation, previewInvitation } from './callsApi';
import { useCallStore } from './callStore';

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
      <div className="call-route-page">
        <h1 className="text-xl font-semibold">Вход в конференцию</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Войдите в аккаунт, чтобы подключиться.</p>
        <Link className="call-route-link mt-4 inline-block" to={`${LOGIN_PATH}?from=${encodeURIComponent(from)}`}>
          Войти
        </Link>
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
            ? 'Конференция завершена'
            : reason === 'no_group_access'
              ? 'Нет доступа к этой группе'
              : reason === 'exhausted'
                ? 'Лимит использований приглашения исчерпан'
                : error || 'Приглашение недействительно';
    return (
      <div className="call-route-page">
        <p>{msg}</p>
        <Link to="/messenger" className="call-route-link">
          В мессенджер
        </Link>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="call-route-page">
        <p>Проверка приглашения…</p>
      </div>
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

  return (
    <div className="call-route-page">
      <h1 className="text-xl font-semibold">
        {preview.mediaType === 'video' ? 'Видеоконференция' : 'Аудиоконференция'}
      </h1>
      {preview.conversationTitle ? (
        <p className="mt-1 text-[var(--text-secondary)]">{preview.conversationTitle}</p>
      ) : null}
      {preview.participantCount != null ? (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Участников: {preview.participantCount}</p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={micOn} onChange={(e) => setMicOn(e.target.checked)} />
          Микрофон
        </label>
        {preview.mediaType === 'video' ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={camOn} onChange={(e) => setCamOn(e.target.checked)} />
            Камера
          </label>
        ) : null}
      </div>

      <button
        type="button"
        className="btn-accept mt-6 px-6 py-3 rounded-xl"
        disabled={!preview.canJoin || joining}
        onClick={() => void onJoin()}
      >
        {joining ? 'Подключение…' : preview.canJoin ? 'Подключиться' : 'Нет доступа'}
      </button>
    </div>
  );
}
