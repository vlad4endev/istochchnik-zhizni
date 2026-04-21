import { useEffect, useRef, useState } from 'react';

import {
  isRealtimeWsOpen,
  sendRealtimeJson,
  subscribeRealtimeMessages,
  subscribeRealtimeOpen,
} from '../../lib/realtimeWsClient';

export type ServicePlanEditorPeer = { memberId: number; memberName: string };

function isPresenceMessage(
  msg: unknown,
): msg is { type: 'service_plan:presence'; servicePlanId: number; peers: ServicePlanEditorPeer[] } {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (m.type !== 'service_plan:presence') return false;
  if (typeof m.servicePlanId !== 'number' || !Number.isFinite(m.servicePlanId)) return false;
  if (!Array.isArray(m.peers)) return false;
  return m.peers.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof (p as { memberId?: unknown }).memberId === 'number' &&
      typeof (p as { memberName?: unknown }).memberName === 'string',
  );
}

/**
 * Подписка на «кто ещё открыт на этом плане» через общий WS (комната `sp:<planId>` на сервере).
 * Возвращает список без текущего пользователя.
 */
export function useServicePlanEditorsPresence(
  activePlanId: number | null,
  authMemberId: number | null,
): ServicePlanEditorPeer[] {
  const [peers, setPeers] = useState<ServicePlanEditorPeer[]>([]);
  const planRef = useRef(activePlanId);
  planRef.current = activePlanId;

  useEffect(() => {
    if (activePlanId == null || authMemberId == null) {
      setPeers([]);
      return;
    }

    const sendJoin = () => {
      const id = planRef.current;
      if (id == null) return;
      sendRealtimeJson({ type: 'service_plan:join', planId: id });
    };

    sendJoin();
    if (!isRealtimeWsOpen()) {
      /* первый join уйдёт после subscribeRealtimeOpen */
    }

    const unsubMsg = subscribeRealtimeMessages((msg) => {
      if (!isPresenceMessage(msg)) return;
      if (msg.servicePlanId !== planRef.current) return;
      setPeers(msg.peers);
    });

    const unsubOpen = subscribeRealtimeOpen(() => {
      sendJoin();
    });

    return () => {
      unsubMsg();
      unsubOpen();
      sendRealtimeJson({ type: 'service_plan:leave', planId: activePlanId });
      setPeers([]);
    };
  }, [activePlanId, authMemberId]);

  return peers.filter((p) => p.memberId !== authMemberId);
}
