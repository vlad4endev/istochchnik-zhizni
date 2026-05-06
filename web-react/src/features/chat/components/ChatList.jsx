import { useShallow } from 'zustand/react/shallow';
import { LuMoon, LuSun } from 'react-icons/lu';

import { useAppearanceStore } from '../../../stores/useAppearanceStore';
import { useChatUiStore } from '../store/chatStore';
import { ChatCard } from './ChatCard';

/**
 * @param {{ onSelect: (id: string) => void, activeId: string | null, withChrome?: boolean }} props
 */
export function ChatList({ onSelect, activeId, withChrome = true }) {
  const chats = useChatUiStore(useShallow((s) => s.chats));
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'light' : 'dark');
    }
  };

  const darkClass =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-gray-950">
      {withChrome ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-3 py-3 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Чаты</h2>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            title="Тема"
            aria-label="Переключить тему"
          >
            {theme === 'dark' || (theme === 'system' && darkClass) ? (
              <LuSun size={18} />
            ) : (
              <LuMoon size={18} />
            )}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Нет диалогов</p>
        ) : (
          chats.map((chat) => (
            <ChatCard
              key={chat.id}
              chat={chat}
              active={activeId === chat.id}
              onSelect={(c) => onSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
