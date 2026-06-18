import type { ConversationListItem } from '../api/messenger';

export type ChatTab = 'all' | 'personal' | 'services' | 'notifications';

export function classifyConversation(conv: ConversationListItem): Exclude<ChatTab, 'all'> {
  if (conv.my_ui_folder === 'personal') return 'personal';
  if (conv.my_ui_folder === 'ministry') return 'services';
  if (conv.type === 'private') return 'personal';
  if (conv.type === 'channel') return 'notifications';
  return 'services';
}

export function filterConversationsByTab(
  conversations: ConversationListItem[],
  tab: ChatTab,
): ConversationListItem[] {
  if (tab === 'all') return conversations;
  return conversations.filter((c) => classifyConversation(c) === tab);
}

export function getUnreadForTab(conversations: ConversationListItem[], tab: ChatTab): number {
  if (tab === 'all') {
    return conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
  }
  return conversations.reduce(
    (sum, c) => sum + (classifyConversation(c) === tab ? (c.unread_count ?? 0) : 0),
    0,
  );
}
