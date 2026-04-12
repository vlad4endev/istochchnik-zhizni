import { useEffect, useRef } from 'react';
import { useChatStore } from '../chatStore';

const APP_TITLE = 'Источник Жизни';

export function useDocumentTitle() {
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const update = (count: number) => {
      if (count === prevRef.current) return;
      prevRef.current = count;
      document.title =
        count > 0
          ? `(${count > 99 ? '99+' : count}) ${APP_TITLE}`
          : APP_TITLE;
    };

    update(useChatStore.getState().totalUnread);

    const unsub = useChatStore.subscribe((state) => {
      update(state.totalUnread);
    });

    return () => {
      unsub();
      document.title = APP_TITLE;
    };
  }, []);
}
