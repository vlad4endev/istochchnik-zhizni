import { create } from 'zustand';

export interface TypingUser {
  memberId: number;
  memberName: string;
}

const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function typingKey(convId: string, memberId: number): string {
  return `${convId}:${memberId}`;
}

function clearTypingTimer(convId: string, memberId: number): void {
  const key = typingKey(convId, memberId);
  const timer = typingTimers.get(key);
  if (timer) clearTimeout(timer);
  typingTimers.delete(key);
}

function armTypingTimer(convId: string, memberId: number, onExpire: () => void): void {
  const key = typingKey(convId, memberId);
  const existing = typingTimers.get(key);
  if (existing) clearTimeout(existing);
  typingTimers.set(
    key,
    setTimeout(() => {
      typingTimers.delete(key);
      onExpire();
    }, 3000),
  );
}

interface MessengerRealtimeState {
  onlineMembers: Set<number>;
  memberLastSeenAt: Record<number, string>;
  typingByConv: Record<string, TypingUser[]>;
  handleWsMessage: (msg: Record<string, unknown>) => void;
}

export const useMessengerRealtimeStore = create<MessengerRealtimeState>((set, get) => ({
  onlineMembers: new Set<number>(),
  memberLastSeenAt: {},
  typingByConv: {},

  handleWsMessage: (msg) => {
    const type = typeof msg.type === 'string' ? msg.type : '';

    if (type === 'ready') {
      if (Array.isArray(msg.onlineMembers)) {
        const ids = (msg.onlineMembers as unknown[]).filter(
          (id): id is number => typeof id === 'number' && Number.isFinite(id),
        );
        set({ onlineMembers: new Set(ids) });
      }
      return;
    }

    if (type === 'presence:online') {
      const memberId = Number(msg.memberId);
      if (!Number.isFinite(memberId)) return;
      const next = new Set(get().onlineMembers);
      next.add(memberId);
      set({ onlineMembers: next });
      return;
    }

    if (type === 'presence:offline') {
      const memberId = Number(msg.memberId);
      if (!Number.isFinite(memberId)) return;
      const next = new Set(get().onlineMembers);
      next.delete(memberId);
      const lastSeenAt = typeof msg.lastSeenAt === 'string' ? msg.lastSeenAt : undefined;
      set((state) => ({
        onlineMembers: next,
        memberLastSeenAt:
          lastSeenAt != null && lastSeenAt.trim() !== ''
            ? { ...state.memberLastSeenAt, [memberId]: lastSeenAt }
            : state.memberLastSeenAt,
      }));
      return;
    }

    if (type === 'typing:start') {
      const convId = String(msg.conversationId ?? '').trim();
      const memberId = Number(msg.memberId);
      const memberName = String(msg.memberName ?? 'Участник');
      if (!convId || !Number.isFinite(memberId)) return;

      set((state) => {
        const existing = state.typingByConv[convId] ?? [];
        const filtered = existing.filter((u) => u.memberId !== memberId);
        return {
          typingByConv: {
            ...state.typingByConv,
            [convId]: [...filtered, { memberId, memberName }],
          },
        };
      });

      armTypingTimer(convId, memberId, () => {
        set((state) => {
          const existing = state.typingByConv[convId] ?? [];
          return {
            typingByConv: {
              ...state.typingByConv,
              [convId]: existing.filter((u) => u.memberId !== memberId),
            },
          };
        });
      });
      return;
    }

    if (type === 'typing:stop') {
      const convId = String(msg.conversationId ?? '').trim();
      const memberId = Number(msg.memberId);
      if (!convId || !Number.isFinite(memberId)) return;
      clearTypingTimer(convId, memberId);
      set((state) => {
        const existing = state.typingByConv[convId] ?? [];
        return {
          typingByConv: {
            ...state.typingByConv,
            [convId]: existing.filter((u) => u.memberId !== memberId),
          },
        };
      });
    }
  },
}));
