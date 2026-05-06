import { LuX } from 'react-icons/lu';

import { useChatUiStore } from '../store/chatStore';

export function ReplyPreview() {
  const replyTo = useChatUiStore((s) => s.replyTo);
  const setReplyTo = useChatUiStore((s) => s.setReplyTo);

  if (!replyTo) return null;

  const preview = replyTo.text?.trim() || 'Сообщение';
  const title = replyTo.senderName?.trim() || (replyTo.isSender ? 'Вы' : '');

  return (
    <div className="flex items-start gap-2 border-l-4 border-[#00BF6D] bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
      <div className="min-w-0 flex-1">
        {title ? <p className="text-xs font-semibold text-[#00BF6D]">{title}</p> : null}
        <p className="truncate text-gray-700 dark:text-gray-200">{preview}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
        onClick={() => setReplyTo(null)}
        aria-label="Отменить ответ"
      >
        <LuX size={18} />
      </button>
    </div>
  );
}
