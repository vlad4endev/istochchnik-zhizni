import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { emitAppToast } from '../../lib/uiFeedback';
import { useAuthStore } from '../auth/authStore';

import { acceptCall, fetchCall, type CallPublic } from './callsApi';
import { useCallStore } from './callStore';

export function CallPage() {
  const { callId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.memberId);
  const declineFromPush = searchParams.get('decline') === '1';
  const activeCall = useCallStore((s) => s.activeCall);
  const hydrateFromPublic = useCallStore((s) => s.hydrateFromPublic);
  const closeCall = useCallStore((s) => s.closeCall);
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
            peerName: peer?.name || (c.type === 'group' ? 'Конференция' : 'Собеседник'),
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

  useEffect(() => {
    if (!activeCall && !loading && call && ['ended', 'declined', 'missed', 'cancelled', 'failed'].includes(call.status)) {
      /* keep error UI */
    }
  }, [activeCall, call, loading]);

  if (loading) {
    return (
      <div className="call-route-page">
        <p>Загрузка звонка…</p>
      </div>
    );
  }

  // Link / standalone meetings: invitees are not chat members — never open ?conversationId=…
  const messengerHref =
    call &&
    call.accessMode !== 'link' &&
    call.conversationId != null &&
    String(call.conversationId).trim() !== ''
      ? `/messenger?conversationId=${call.conversationId}`
      : '/messenger';

  if (error) {
    return (
      <div className="call-route-page">
        <p>{error}</p>
        <Link to={messengerHref} className="call-route-link">
          Вернуться в чат
        </Link>
      </div>
    );
  }

  if (activeCall?.status === 'ringing_in' && call) {
    return (
      <div className="call-route-page call-route-page--incoming">
        <p className="call-stage__name">{activeCall.peerName}</p>
        <p className="call-stage__status">
          {activeCall.callType === 'video' ? 'Входящий видеозвонок' : 'Входящий звонок'}
        </p>
        <div className="call-actions" style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            className="btn-reject"
            onClick={() => {
              void import('./callsApi').then(({ declineCall }) =>
                declineCall(call.id).finally(() => {
                  closeCall();
                  void navigate(messengerHref);
                }),
              );
            }}
          >
            Отклонить
          </button>
          <button
            type="button"
            className="btn-accept"
            onClick={() => {
              void acceptCall(call.id)
                .then(() => {
                  useCallStore.getState().setStatus('active');
                })
                .catch((e) => emitAppToast(e instanceof Error ? e.message : 'Ошибка', 'error'));
            }}
          >
            Принять
          </button>
        </div>
      </div>
    );
  }

  // CallWindow overlay is mounted in Layout — avoid a second LiveKit room.
  return (
    <div className="call-route-page call-route-page--active">
      <p className="call-stage__status">Звонок активен</p>
      <Link to={messengerHref} className="call-route-link">
        Вернуться в чат
      </Link>
    </div>
  );
}
