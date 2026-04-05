import { createContext, useContext, type ReactNode } from 'react';
import { useMessengerWs } from './useMessengerWs';

type MessengerWsApi = ReturnType<typeof useMessengerWs>;

const MessengerWsContext = createContext<MessengerWsApi | null>(null);

/**
 * Держит одно WS-подключение для всего приложения (счётчик в таббаре, тосты и т.д.).
 * Раньше хук жил только в MessengerPage — на других страницах и в /messenger/.../manage чаты не синкались.
 */
export function MessengerWsProvider({ children }: { children: ReactNode }) {
  const api = useMessengerWs();
  return <MessengerWsContext.Provider value={api}>{children}</MessengerWsContext.Provider>;
}

export function useMessengerWsContext(): MessengerWsApi {
  const ctx = useContext(MessengerWsContext);
  if (!ctx) {
    throw new Error('useMessengerWsContext: оберните приложение в <MessengerWsProvider>');
  }
  return ctx;
}
