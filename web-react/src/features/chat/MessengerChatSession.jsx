import { MessageThread } from './components/MessageThread';

/**
 * @param {{
 *   conversationId: string,
 *   onBack: () => void,
 *   sendMessage: (chatId: string, text: string, type?: string) => void,
 *   sendTyping: (chatId: string, phase: 'start' | 'stop') => void,
 * }} props
 */
export function MessengerChatSession({ conversationId, onBack, sendMessage, sendTyping }) {
  return (
    <MessageThread
      conversationId={conversationId}
      onBack={onBack}
      sendMessage={sendMessage}
      sendTyping={sendTyping}
    />
  );
}
