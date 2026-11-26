import { describe, expect, it } from 'vitest';

import type { ConversationListItem } from './api/messengerApi';
import { canSendTextToConversation, conversationTitle } from './conversationDisplay';

function conv(over: Partial<ConversationListItem>): ConversationListItem {
  return {
    id: '10',
    type: 'group',
    title: 'Группа служения',
    avatar_url: null,
    my_role: 'member',
    ...over,
  } as ConversationListItem;
}

describe('canSendTextToConversation', () => {
  it('обычные чаты доступны', () => {
    expect(canSendTextToConversation(conv({}))).toBe(true);
    expect(canSendTextToConversation(conv({ type: 'private' }))).toBe(true);
  });

  it('черновики без числового id недоступны', () => {
    expect(canSendTextToConversation(conv({ id: 'draft:5' }))).toBe(false);
  });

  it('в канал пишут только владелец и админ', () => {
    expect(canSendTextToConversation(conv({ type: 'channel', my_role: 'member' }))).toBe(false);
    expect(canSendTextToConversation(conv({ type: 'channel', my_role: 'admin' }))).toBe(true);
    expect(canSendTextToConversation(conv({ type: 'channel', my_role: 'owner' }))).toBe(true);
  });

  it('группа с запретом писать — только owner/admin', () => {
    const perms = { can_send_messages: false } as ConversationListItem['default_permissions'];
    expect(canSendTextToConversation(conv({ default_permissions: perms }))).toBe(false);
    expect(canSendTextToConversation(conv({ default_permissions: perms, my_role: 'admin' }))).toBe(true);
  });
});

describe('conversationTitle', () => {
  it('для группы берёт название, иначе запасное', () => {
    expect(conversationTitle(conv({ title: ' Молитва ' }))).toBe('Молитва');
    expect(conversationTitle(conv({ title: '' }))).toBe('Группа');
    expect(conversationTitle(conv({ type: 'channel', title: '' }))).toBe('Канал');
  });
});
