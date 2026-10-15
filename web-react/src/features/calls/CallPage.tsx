import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LuMessageCircle, LuPhoneIncoming, LuPhoneOff } from 'react-icons/lu';

import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';

import { acceptCall, fetchCall, type CallPublic } from './callsApi';
import { MeetingAvatar } from './MeetingAvatar';
import { useCallStore } from './callStore';
import './calls.css';

function CallRouteShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={['call-route-shell', className].filter(Boolean).join(' ')}
      role="main"
    >
      <div className="call-route-shell__atmosphere" aria-hidden>
        <span className="call-route-shell__glow call-route-shell__glow--a" />
        <span className="call-route-shell__glow call-route-shell__glow--b" />
      </div>
      <div className="call-route-shell__panel">{children}</div>
    </div>
  );
}

function callTitle(call: CallPublic | null, fallback: string): string {
  const t = call?.title?.trim();
  if (t) return t;
  return fallback;
}

export function CallPage() {
  const { callId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.memberId);
  const declineFromPush = searchParams.get('decline') === '1';
  const activeCall = useCallStore((s) => s.activeCall);
  const hydrateFromPublic = useCallStore((s) => s.hydrateFromPublic);
  const closeCall = useCallStore((s) => s.closeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
  const expandCall = useCallStore((s) => s.expandCall);
  const minimizeCall = useCallStore((s) => s.minimizeCall);
  const [call, setCall] = useState<CallPublic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const c = await fetchCall(callId);
        if (cancelled) return;
        setCall(c);
        if (['ended', 'declined', 'missed', 'cancelled', 'failed'].includes(c.status)) {
          setError(
            c.status === 'missed'
              ? 'Пропущенный вызов'
              : c.status === 'declined'
                ? 'Звонок отклонён'
                : c.status === 'cancelled'
                  ? 'Звонок отменён'
                  : 'Звонок уже завершён',
          );
          return;
        }
        const me = Number(userId);
        const peer =
          c.participants?.find((p) => p.userId !== me) ??
          c.participants?.[0];
        const isInitiator = c.initiatedBy === me;

        if (c.type === 'direct' && c.status === 'ringing' && !isInitiator && declineFromPush) {
          const { declineCall } = await import('./callsApi');
          await declineCall(c.id).catch(() => undefined);
          setError('Звонок отклонён');
          return;
        }

        if (c.type === 'direct' && c.status === 'ringing' && !isInitiator) {
          hydrateFromPublic(c, {
            peerId: peer?.userId ?? 0,
            peerName: peer?.name || 'Собеседник',
            peerAvatar: peer?.avatarUrl ?? '',
            isInitiator: false,
            status: 'ringing_in',
          });
        } else {
          hydrateFromPublic(c, {
            peerId: peer?.userId ?? 0,
            peerName:
              c.title?.trim() ||
              peer?.name ||
              (c.type === 'group' ? 'Конференция' : 'Собеседник'),
            peerAvatar: peer?.avatarUrl ?? '',
            isInitiator,
            status: c.status === 'ringing' && isInitiator ? 'calling' : 'active',
            inviteUrl: c.inviteUrl,
            // Link meetings: do not bind UI to a chat the joiner may not belong to.
            conversationId: c.accessMode === 'link' ? '' : (c.conversationId ?? ''),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, declineFromPush, hydrateFromPublic, userId]);

  // Opening /call/:id while minimized restores the full call UI.
  useEffect(() => {
    if (!callId) return;
    if (activeCall?.callId !== callId) return;
    if (!useCallStore.getState().uiMinimized) return;
    useCallStore.getState().expandCall();
  }, [activeCall?.callId, callId]);

  // Link / standalone meetings: invitees are not chat members — never open ?conversationId=…
  const messengerHref =
    call &&
    call.accessMode !== 'link' &&
    call.conversationId != null &&
    String(call.conversationId).trim() !== ''
      ? `/messenger?conversationId=${call.conversationId}`
      : '/messenger';

  const mediaType: 'audio' | 'video' =
    activeCall?.callType === 'audio' || call?.mediaType === 'audio' ? 'audio' : 'video';
  const title = callTitle(
    call,
    activeCall?.peerName?.trim() ||
      (mediaType === 'video' ? 'Видеовстреча' : 'Аудиовстреча'),
  );

  if (loading) {
    return (
      <CallRouteShell className="call-route-shell--loading">
        <p className="call-route-shell__eyebrow">Источник жизни · встречи</p>
        <MeetingAvatar mediaType={mediaType} size="md" />
        <h1 className="call-route-shell__title">Подключение…</h1>
        <p className="call-route-shell__lead">Загрузка звонка</p>
        <div className="call-route-shell__spinner" aria-hidden />
      </CallRouteShell>
    );
  }

  if (error) {
    return (
      <CallRouteShell className="call-route-shell--ended">
        <p className="call-route-shell__eyebrow">Источник жизни · встречи</p>
        <span className="call-route-shell__status-icon" aria-hidden>
          <LuPhoneOff size={28} strokeWidth={2} />
        </span>
        <h1 className="call-route-shell__title">{title}</h1>
        <p className="call-route-shell__lead">{error}</p>
        <div className="call-route-shell__actions">
          <Link to={messengerHref} className="call-route-shell__cta">
            <LuMessageCircle size={18} strokeWidth={2.2} aria-hidden />
            В мессенджер
          </Link>
          <Link to="/dashboard" className="call-route-shell__cta call-route-shell__cta--ghost">
            На главную
          </Link>
        </div>
      </CallRouteShell>
    );
  }

  if (activeCall?.status === 'ringing_in' && call) {
    return (
      <CallRouteShell className="call-route-shell--incoming">
        <p className="call-route-shell__eyebrow">Входящий вызов</p>
        <MeetingAvatar mediaType={mediaType} size="md" />
        <h1 className="call-route-shell__title">{activeCall.peerName}</h1>
        <p className="call-route-shell__lead">
          {mediaType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок'}
        </p>
        <div className="call-route-shell__actions call-route-shell__actions--row">
          <button
            type="button"
            className="call-route-shell__cta call-route-shell__cta--reject"
            onClick={() => {
              void import('./callsApi').then(({ declineCall }) =>
                declineCall(call.id).finally(() => {
                  closeCall();
                  void navigate(messengerHref);
                }),
              );
            }}
          >
            <LuPhoneOff size={18} strokeWidth={2.2} aria-hidden />
            Отклонить
          </button>
          <button
            type="button"
            className="call-route-shell__cta call-route-shell__cta--accept"
            onClick={() => {
              void acceptCall(call.id)
                .then(() => {
                  useCallStore.getState().setStatus('active');
                })
                .catch((e) => emitAppToast(e instanceof Error ? e.message : 'Ошибка', 'error'));
            }}
          >
            <LuPhoneIncoming size={18} strokeWidth={2.2} aria-hidden />
            Принять
          </button>
        </div>
      </CallRouteShell>
    );
  }

  // Call ended / left while still on /call/:id — store cleared, no overlay.
  if (!activeCall || activeCall.callId !== callId) {
    return (
      <CallRouteShell className="call-route-shell--ended">
        <p className="call-route-shell__eyebrow">Источник жизни · встречи</p>
        <span className="call-route-shell__status-icon" aria-hidden>
          <LuPhoneOff size={28} strokeWidth={2} />
        </span>
        <h1 className="call-route-shell__title">{title}</h1>
        <p className="call-route-shell__lead">Звонок завершён</p>
        <div className="call-route-shell__actions">
          <Link to={messengerHref} className="call-route-shell__cta">
            <LuMessageCircle size={18} strokeWidth={2.2} aria-hidden />
            В мессенджер
          </Link>
          <Link to="/dashboard" className="call-route-shell__cta call-route-shell__cta--ghost">
            На главную
          </Link>
        </div>
      </CallRouteShell>
    );
  }

  // CallWindow overlay is mounted in Layout — avoid a second LiveKit room.
  // Underlay matches the dark call UI so Suspense/flash never shows a blank light page.
  return (
    <CallRouteShell className="call-route-shell--active">
      <p className="call-route-shell__eyebrow">
        {uiMinimized ? 'Звонок свёрнут' : 'Идёт звонок'}
      </p>
      <MeetingAvatar mediaType={mediaType} size="md" />
      <h1 className="call-route-shell__title">{title}</h1>
      <p className="call-route-shell__lead">
        {uiMinimized
          ? 'Продолжается в фоне — можно вернуться в любой момент'
          : mediaType === 'video'
            ? 'Видеовстреча'
            : 'Аудиовстреча'}
      </p>
      <div className="call-route-shell__badge" aria-hidden>
        В эфире
      </div>
      <div className="call-route-shell__actions">
        {uiMinimized ? (
          <button
            type="button"
            className="call-route-shell__cta"
            onClick={() => {
              expandCall();
            }}
          >
            Вернуться в звонок
          </button>
        ) : (
          <Link
            to={messengerHref}
            className="call-route-shell__cta call-route-shell__cta--ghost"
            onClick={() => {
              minimizeCall();
            }}
          >
            <LuMessageCircle size={18} strokeWidth={2.2} aria-hidden />
            Свернуть в чат
          </Link>
        )}
      </div>
    </CallRouteShell>
  );
}
