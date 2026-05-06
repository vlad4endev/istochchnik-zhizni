/**
 * @param {{ chat: import('../store/chatStore').Chat, active?: boolean, onSelect: (chat: import('../store/chatStore').Chat) => void }} props
 */
export function ChatCard({ chat, active = false, onSelect }) {
  const timeLabel =
    typeof chat.lastTime === 'number' && Number.isFinite(chat.lastTime)
      ? new Date(chat.lastTime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : '';

  return (
    <button
      type="button"
      onClick={() => onSelect(chat)}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${
        active ? 'bg-gray-100 dark:bg-gray-800/80' : ''
      }`}
    >
      <div className="relative h-12 w-12 shrink-0">
        {chat.avatar ? (
          <img src={chat.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
            {chat.name?.slice(0, 1)?.toUpperCase() ?? '?'}
          </div>
        )}
        {chat.isOnline ? (
          <span
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#00BF6D] dark:border-gray-900"
            aria-hidden
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="truncate font-medium text-gray-900 dark:text-gray-100">{chat.name}</span>
          <span className="shrink-0 text-xs text-gray-400">{timeLabel}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="truncate text-sm text-gray-500 dark:text-gray-400">{chat.lastMessage || ' '}</p>
          {chat.unreadCount > 0 ? (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-xs text-white">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
