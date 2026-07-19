import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/features/messenger/api/messengerApi', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('../src/utils/audio', () => ({
  playAudio: vi.fn(),
}));

import { useChatStore } from '../src/features/messenger/chatStore';
import * as messengerApi from '../src/features/messenger/api/messengerApi';

describe('messenger chatStore last message preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useChatStore.setState((s) => ({
      ...s,
      currentMemberId: 7,
      activeConversationId: 'conv-1',
      replyToMessage: null,
      conversations: [
        {
          id: 'conv-1',
          type: 'group',
          title: 'Молодежь',
          avatar_url: null,
          updated_at: '2026-05-07T11:59:00.000Z',
          last_message: {
            id: '100',
            content: 'Предыдущее сообщение',
            sender_id: 2,
            sender_name: 'Иван',
            created_at: '2026-05-07T11:59:00.000Z',
            is_deleted: false,
          },
          unread_count: 0,
          other_member: null,
        },
      ],
      messagesByConv: {
        'conv-1': [
          {
            id: '100',
            conversation_id: 'conv-1',
            sender_id: 2,
            content: 'Предыдущее сообщение',
            reply_to_message_id: null,
            is_edited: false,
            is_deleted: false,
            created_at: '2026-05-07T11:59:00.000Z',
            updated_at: '2026-05-07T11:59:00.000Z',
            sender_name: 'Иван',
            sender_first_name: 'Иван',
            sender_last_name: 'Иванов',
            reply_preview: null,
            reactions: [],
          },
        ],
      },
    }));
  });

  it('updates conversations.last_message to the newest sent message', async () => {
    vi.mocked(messengerApi.sendMessage).mockResolvedValue({
      id: '101',
      conversation_id: 'conv-1',
      sender_id: 7,
      content: 'Новое сообщение',
      payload_type: 'text',
      payload: { text: 'Новое сообщение' },
      reply_to_message_id: null,
      is_edited: false,
      is_deleted: false,
      created_at: '2026-05-07T12:00:00.000Z',
      updated_at: '2026-05-07T12:00:00.000Z',
      sender_name: 'Вы',
      sender_first_name: null,
      sender_last_name: null,
      reply_preview: null,
      reactions: [],
      status: 'sent',
    });

    const ok = await useChatStore.getState().sendMessage('conv-1', 'Новое сообщение');
    expect(ok).toBe(true);

    const state = useChatStore.getState();
    const conversation = state.conversations.find((c) => c.id === 'conv-1');
    expect(conversation?.last_message?.id).toBe('101');
    expect(conversation?.last_message?.content).toBe('Новое сообщение');
    expect(conversation?.updated_at).toBe('2026-05-07T12:00:00.000Z');
  });

  it('keeps a single reply target between swipe and context-menu reply', () => {
    const msgA = {
      id: '100',
      conversation_id: 'conv-1',
      sender_id: 2,
      content: 'A',
      reply_to_message_id: null,
      is_edited: false,
      is_deleted: false,
      created_at: '2026-05-07T11:59:00.000Z',
      updated_at: '2026-05-07T11:59:00.000Z',
      sender_name: 'Иван',
      sender_first_name: 'Иван',
      sender_last_name: 'Иванов',
      reply_preview: null,
      reactions: [],
    };
    const msgB = { ...msgA, id: '101', content: 'B', sender_name: 'Пётр' };

    useChatStore.getState().setReplyingTo(msgA);
    expect(useChatStore.getState().replyingTo?.id).toBe('100');
    expect(useChatStore.getState().replyToMessage).toBeNull();

    useChatStore.getState().setReplyTo(msgB);
    expect(useChatStore.getState().replyToMessage?.id).toBe('101');
    expect(useChatStore.getState().replyingTo).toBeNull();

    useChatStore.getState().setEditing(msgA);
    expect(useChatStore.getState().editingMessage?.id).toBe('100');
    expect(useChatStore.getState().replyToMessage).toBeNull();
    expect(useChatStore.getState().replyingTo).toBeNull();
  });

  it('clears swipe-reply when switching conversations', () => {
    const msg = {
      id: '100',
      conversation_id: 'conv-1',
      sender_id: 2,
      content: 'A',
      reply_to_message_id: null,
      is_edited: false,
      is_deleted: false,
      created_at: '2026-05-07T11:59:00.000Z',
      updated_at: '2026-05-07T11:59:00.000Z',
      sender_name: 'Иван',
      sender_first_name: 'Иван',
      sender_last_name: 'Иванов',
      reply_preview: null,
      reactions: [],
    };
    useChatStore.getState().setReplyingTo(msg);
    useChatStore.getState().setActiveConversation('conv-2');
    expect(useChatStore.getState().replyingTo).toBeNull();
    expect(useChatStore.getState().replyToMessage).toBeNull();
  });

  it('drops mismatched privateDraftPeer when activating another draft id', () => {
    useChatStore.getState().openPrivateDraft({
      id: 5,
      name: 'Анна',
      first_name: 'Анна',
      last_name: 'Иванова',
      avatar_url: null,
    });
    expect(useChatStore.getState().privateDraftPeer?.id).toBe(5);

    useChatStore.getState().setActiveConversation('draft:9');
    expect(useChatStore.getState().activeConversationId).toBe('draft:9');
    expect(useChatStore.getState().privateDraftPeer).toBeNull();
  });

  it('reuses existing private conversation instead of opening a draft', async () => {
    useChatStore.setState((s) => ({
      ...s,
      conversations: [
        {
          id: 'priv-77',
          type: 'private',
          title: null,
          avatar_url: null,
          updated_at: '2026-05-07T12:00:00.000Z',
          last_message: null,
          unread_count: 0,
          other_member: {
            id: 77,
            name: 'Новый',
            first_name: 'Новый',
            last_name: 'Участник',
            avatar_url: null,
          },
        },
      ],
    }));

    const ok = await useChatStore.getState().ensurePrivateDraftFromConversationId('draft:77');
    expect(ok).toBe(true);
    expect(useChatStore.getState().activeConversationId).toBe('priv-77');
    expect(useChatStore.getState().privateDraftPeer).toBeNull();
  });
});
