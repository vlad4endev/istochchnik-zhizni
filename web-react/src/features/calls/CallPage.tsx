import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  IcMessage,
  IcPhoneIncoming,
  IcHangup,
  IcVideo,
} from './callIcons';

import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';

import { acceptCall, fetchCall, type CallPublic } from './callsApi';
import {
  GlassCallCta,
  GlassCallShell,
  GlassCallTitle,
} from './glassCallUi';
import { useCallStore } from './callStore';
import './calls.css';

function callTitle(call: CallPublic | null, fallback: string): string {
  // Prefer stored meeting/template name (e.g. «Вечерняя молитвенная стража»).
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
      <GlassCallShell className="glass-call--simple" closeTo={messengerHref}>
        <GlassCallTitle title="Подключение…" />
        <p className="glass-call__lead">Загрузка звонка</p>
        <div className="glass-call__spinner" aria-hidden />
      </GlassCallShell>
    );
  }

  if (error) {
    return (
      <GlassCallShell className="glass-call--ended" closeTo={messengerHref}>
        <div className="glass-call__status-card" aria-hidden>
          <span className="glass-call__status-icon">
            <IcHangup size={32} strokeWidth={1.7} />
          </span>
        </div>
        <GlassCallTitle title={error} />
        {title ? <p className="glass-call__lead glass-call__lead--meeting">{title}</p> : null}
        <div className="glass-call__spacer" />
        <GlassCallCta to={messengerHref} icon={<IcMessage size={20} strokeWidth={1.8} />}>
          В мессенджер
        </GlassCallCta>
        <GlassCallCta to="/dashboard" variant="ghost">
          На главную
        </GlassCallCta>
      </GlassCallShell>
    );
  }

  if (activeCall?.status === 'ringing_in' && call) {
    return (
      <GlassCallShell
        className="glass-call--incoming"
        brand="Входящий вызов"
        closeTo={messengerHref}
        onClose={() => {
          void import('./callsApi').then(({ declineCall }) =>
            declineCall(call.id).finally(() => {
              closeCall();
              void navigate(messengerHref);
            }),
          );
        }}
      >
        <div className="glass-call__status-card glass-call__status-card--live" aria-hidden>
          <span className="glass-call__status-icon">
            {mediaType === 'video' ? (
              <IcVideo size={32} strokeWidth={1.7} />
            ) : (
              <IcPhoneIncoming size={32} strokeWidth={1.7} />
            )}
          </span>
        </div>
        <GlassCallTitle title={activeCall.peerName} />
        <p className="glass-call__lead">
          {mediaType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок'}
        </p>
        <div className="glass-call__spacer" />
        <div className="glass-call__actions-row">
          <button
            type="button"
            className="glass-call__pill glass-call__pill--reject"
            onClick={() => {
              void import('./callsApi').then(({ declineCall }) =>
                declineCall(call.id).finally(() => {
                  closeCall();
                  void navigate(messengerHref);
                }),
              );
            }}
          >
            <IcHangup size={18} strokeWidth={2.2} aria-hidden />
            Отклонить
          </button>
          <button
            type="button"
            className="glass-call__pill glass-call__pill--accept"
            onClick={() => {
              void acceptCall(call.id)
                .then(() => {
                  useCallStore.getState().setStatus('active');
                })
                .catch((e) => emitAppToast(e instanceof Error ? e.message : 'Ошибка', 'error'));
            }}
          >
            <IcPhoneIncoming size={18} strokeWidth={2.2} aria-hidden />
            Принять
          </button>
        </div>
      </GlassCallShell>
    );
  }

  // Call ended / left while still on /call/:id — store cleared, no overlay.
  if (!activeCall || activeCall.callId !== callId) {
    return (
      <GlassCallShell className="glass-call--ended" closeTo={messengerHref}>
        <div className="glass-call__status-card" aria-hidden>
          <span className="glass-call__status-icon">
            <IcHangup size={32} strokeWidth={1.7} />
          </span>
        </div>
        <GlassCallTitle title="Звонок завершён" />
        {title ? <p className="glass-call__lead glass-call__lead--meeting">{title}</p> : null}
        <div className="glass-call__spacer" />
        <GlassCallCta to={messengerHref} icon={<IcMessage size={20} strokeWidth={1.8} />}>
          В мессенджер
        </GlassCallCta>
        <GlassCallCta to="/dashboard" variant="ghost">
          На главную
        </GlassCallCta>
      </GlassCallShell>
    );
  }

  // CallWindow overlay is mounted in Layout — avoid a second LiveKit room.
  return (
    <GlassCallShell className="glass-call--active" closeTo={messengerHref}>
      <div className="glass-call__status-card glass-call__status-card--live" aria-hidden>
        <span className="glass-call__status-icon">
          <IcVideo size={32} strokeWidth={1.7} />
        </span>
        <span className="glass-call__live-badge">В эфире</span>
      </div>
      <GlassCallTitle title={title} />
      <p className="glass-call__lead">
        {uiMinimized
          ? 'Продолжается в фоне — можно вернуться в любой момент'
          : mediaType === 'video'
            ? 'Видеовстреча'
            : 'Аудиовстреча'}
      </p>
      <div className="glass-call__spacer" />
      {uiMinimized ? (
        <GlassCallCta onClick={() => expandCall()}>Вернуться в звонок</GlassCallCta>
      ) : (
        <GlassCallCta
          to={messengerHref}
          variant="ghost"
          onClick={() => minimizeCall()}
          icon={<IcMessage size={20} strokeWidth={1.8} />}
        >
          Свернуть в чат
        </GlassCallCta>
      )}
    </GlassCallShell>
  );
}
