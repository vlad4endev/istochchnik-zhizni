import { MessageStatusIcon } from './MessageStatusIcon';

/**
 * @param {{
 *   text: string,
 *   isSender: boolean,
 *   timestamp: number,
 *   status?: import('../store/chatStore').ChatMessage['status'],
 *   showStatus?: boolean,
 * }} props
 */
export function TextBubble({ text, isSender, timestamp, status = 'sent', showStatus = false }) {
  const timeLabel = new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const bubble =
    isSender
      ? 'bg-[#00BF6D] text-white rounded-[20px] rounded-br-sm'
      : 'bg-gray-100 text-gray-900 rounded-[20px] rounded-bl-sm dark:bg-gray-700 dark:text-gray-100';

  return (
    <div className={`inline-flex max-w-[85%] flex-col gap-0.5 ${isSender ? 'items-end' : 'items-start'}`}>
      <div className={`px-3 py-2 ${bubble}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-snug">{text}</p>
      </div>
      <div
        className={`flex items-center gap-1 px-1 text-[10px] opacity-60 ${
          isSender ? 'flex-row-reverse' : ''
        }`}
      >
        <span>{timeLabel}</span>
        {isSender && showStatus ? <MessageStatusIcon status={status} /> : null}
      </div>
    </div>
  );
}
