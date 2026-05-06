import { useEffect } from 'react';

import { useSocket } from './hooks/useSocket';
import { startMessengerToChatUiSync } from './messengerToChatUiSync';

/**
 * Подключает адаптер сокета и синхронизацию messenger → UI store для Flutter-стиля чата.
 */
export function MessengerChatUiProvider({ children }) {
  useSocket();

  useEffect(() => {
    const unsub = startMessengerToChatUiSync();
    return unsub;
  }, []);

  return children;
}
