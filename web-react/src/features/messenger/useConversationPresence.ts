import { useCallback } from 'react';
import { useChatStore } from './chatStore';
import { formatMessengerLastSeen } from './lastSeenUtils';

export interface PresenceInfo {
  isOnline: boolean;
  lastSeenAt: string | null;
  statusText: string;
}

export function useConversationPresence(
  conversationId: string | null,
): PresenceInfo | null {
  return useChatStore(
    useCallback(
      (s) => {
        if (!conversationId) return null;
        const conv = s.conversations.find((c) => c.id === conversationId);
        if (conv?.type !== 'private' || !conv.other_member) return null;

        const memberId = conv.other_member.id;
        const isOnline = s.onlineMembers.has(memberId);
        const lastSeenAt = s.memberLastSeenAt[memberId]
          ?? conv.other_member.last_seen_at
          ?? null;

        const statusText = isOnline
          ? 'в сети'
          : formatMessengerLastSeen(lastSeenAt);

        return { isOnline, lastSeenAt, statusText };
      },
      [conversationId],
    ),
  );
}
