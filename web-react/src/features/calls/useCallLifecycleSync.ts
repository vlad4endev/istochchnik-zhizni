import { useEffect } from 'react';

import { emitAppToast } from '../../lib/uiFeedback';
import { subscribeRealtimeMessages, subscribeRealtimeOpen } from '../../lib/realtimeWsClient';

import { fetchCall } from './callsApi';
import {
  CALL_SYNC_POLL_MS,
  resolveCallSync,
  wasCallAcceptedLocally,
  type LocalRingState,
} from './callStateSync';
import { useCallStore } from './callStore';

/**
 * Держит «переходные» состояния звонка (исходящие гудки / входящий на /call/:id)
 * в согласии с сервером, даже если WS-событие потерялось при переподключении.
 * Монтируется без LiveKit (в CallWindowHost), поэтому работает и для ringing_in.
 */
export function useCallLifecycleSync(): void {
  const callId = useCallStore((s) => s.activeCall?.callId ?? null);
  const status = useCallStore((s) => s.activeCall?.status ?? null);
  const isInitiator = useCallStore((s) => Boolean(s.activeCall?.isInitiator));
  const callKind = useCallStore((s) => s.activeCall?.callKind ?? 'direct');

  const local: LocalRingState | null =
    status === 'ringing_in'
      ? 'ringing_in'
      : status === 'calling' && isInitiator && callKind === 'direct'
        ? 'calling'
        : null;

  // ringing_in: CallWindow не смонтирован — WS-события завершения обрабатываем здесь.
  useEffect(() => {
    if (!callId || local !== 'ringing_in') return;
    return subscribeRealtimeMessages((raw) => {
      const m = raw as { type?: string; callId?: string; reason?: string };
      if (String(m.callId ?? '') !== callId) return;
      const cur = useCallStore.getState().activeCall;
      if (!cur || cur.callId !== callId || cur.status !== 'ringing_in') return;
      if (m.type === 'call:answered_elsewhere') {
        if (wasCallAcceptedLocally(callId)) return;
        emitAppToast('Звонок принят на другом устройстве', 'info');
        useCallStore.getState().closeCall();
        return;
      }
      if (m.type === 'call:cancelled' || m.type === 'call:rejected' || m.type === 'call:ended') {
        if (m.type === 'call:cancelled') emitAppToast('Звонок отменён', 'info');
        useCallStore.getState().closeCall();
      }
    });
  }, [callId, local]);

  // Сверка с сервером: периодически и сразу после переподключения WS.
  useEffect(() => {
    if (!callId || !local) return;
    let disposed = false;
    let inflight = false;

    const check = async () => {
      if (disposed || inflight) return;
      inflight = true;
      try {
        const call = await fetchCall(callId);
        if (disposed) return;
        const cur = useCallStore.getState().activeCall;
        if (!cur || cur.callId !== callId || cur.status !== status) return;
        const action = resolveCallSync(local, call.status, wasCallAcceptedLocally(callId));
        if (action.kind === 'activate') {
          useCallStore.getState().setStatus('active');
        } else if (action.kind === 'close') {
          if (action.message) emitAppToast(action.message, 'info');
          useCallStore.getState().closeCall();
        }
      } catch {
        // сеть мигнула — следующая попытка по таймеру
      } finally {
        inflight = false;
      }
    };

    const timer = window.setInterval(() => void check(), CALL_SYNC_POLL_MS);
    const unsubOpen = subscribeRealtimeOpen(({ wasReconnected }) => {
      if (wasReconnected) void check();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      unsubOpen();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [callId, local, status]);
}
