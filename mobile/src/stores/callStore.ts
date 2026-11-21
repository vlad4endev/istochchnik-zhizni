import { create } from 'zustand';

import type { CallMediaType } from '../api/calls';
import { callKitReportEnded, isCallKitReported } from '../lib/callKit';
import { dismissIncomingCallScreen } from '../lib/callScreen';
import { applyCallEvent, type ActiveCall, type CallEvent, type CallPhase } from '../lib/callState';

export type IncomingCall = {
  callId: string;
  callerId: number;
  callerName: string;
  callerAvatar: string | null;
  callType: CallMediaType;
  conversationId: string;
};

type CallStoreState = {
  active: ActiveCall | null;
  incoming: IncomingCall | null;
  openCall: (call: Omit<ActiveCall, 'phase'> & { phase?: CallPhase }) => void;
  setPhase: (phase: CallPhase) => void;
  closeCall: () => void;
  setIncoming: (incoming: IncomingCall | null) => void;
  /** События звонков из общего WebSocket. */
  handleWsMessage: (msg: Record<string, unknown>) => void;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export const useCallStore = create<CallStoreState>((set, get) => ({
  active: null,
  incoming: null,

  openCall: (call) =>
    set({ active: { ...call, phase: call.phase ?? (call.kind === 'group' ? 'connecting' : 'calling') } }),

  setPhase: (phase) =>
    set((s) => (s.active && s.active.phase !== 'ended' ? { active: { ...s.active, phase } } : s)),

  closeCall: () => set({ active: null }),

  setIncoming: (incoming) => {
    const prev = get().incoming;
    // Экран «Входящий» закрыт (ответили, отклонили, сбросили) — полноэкранное уведомление больше не нужно.
    if (prev && !incoming) dismissIncomingCallScreen(prev.callId);
    set({ incoming });
  },

  handleWsMessage: (msg) => {
    const type = str(msg.type);
    if (!type.startsWith('call:')) return;
    const callId = str(msg.callId);

    if (type === 'call:incoming') {
      const callerId = Number(msg.callerId);
      if (!callId || !Number.isFinite(callerId)) return;
      // Звонок уже показывает системный экран iPhone — второй экран не нужен.
      if (isCallKitReported(callId)) return;
      // Уже в звонке — второй входящий не показываем (сервер ответит «занят»).
      if (get().active && get().active!.phase !== 'ended') return;
      set({
        incoming: {
          callId,
          callerId,
          callerName: str(msg.callerName) || 'Участник',
          callerAvatar: typeof msg.callerAvatar === 'string' ? msg.callerAvatar : null,
          callType: msg.callType === 'video' ? 'video' : 'audio',
          conversationId: str(msg.conversationId),
        },
      });
      return;
    }

    if (type === 'call:cancelled' || type === 'call:ended' || type === 'call:rejected') {
      dismissIncomingCallScreen(callId);
    }

    // Звонок закончился на сервере — убираем его и с системного экрана iPhone.
    if ((type === 'call:cancelled' || type === 'call:ended' || type === 'call:rejected') && isCallKitReported(callId)) {
      callKitReportEnded(callId);
    }

    // Звонящий передумал или звонок завершён — убираем «входящий».
    if (
      (type === 'call:cancelled' || type === 'call:ended' || type === 'call:rejected') &&
      get().incoming?.callId === callId
    ) {
      set({ incoming: null });
    }

    if (
      type === 'call:accepted' ||
      type === 'call:rejected' ||
      type === 'call:cancelled' ||
      type === 'call:ended' ||
      type === 'call:error'
    ) {
      const ev = { type, callId, reason: str(msg.reason) || undefined, error: str(msg.error) } as CallEvent;
      set((s) => ({ active: applyCallEvent(s.active, ev) }));
    }
  },
}));
