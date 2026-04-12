import type { MessageWithSender } from './api/messengerApi';

export interface GroupedMessage extends MessageWithSender {
  /** True if this message is grouped with the previous one (same sender, < 5 min gap) — hide avatar/name */
  isGroupedPrev: boolean;
  /** True if this message is grouped with the next one */
  isGroupedNext: boolean;
  /** True if a date divider should be shown before this message */
  showDate: boolean;
  /** Human-readable date label: "Сегодня", "Вчера", "13 апреля 2025" */
  dateLabel: string;
}

const GROUP_GAP_MS = 5 * 60 * 1000; // 5 minutes

function formatDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return 'Сегодня';
  if (d.getTime() === yesterday.getTime()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Groups consecutive messages from the same sender within a 5-minute window.
 * Returns messages annotated with grouping flags and date dividers.
 * Interface compatible with existing ChatWindow / MessageBubble props.
 */
export function groupMessages(messages: MessageWithSender[]): GroupedMessage[] {
  return messages.map((msg, i) => {
    const prev = messages[i - 1] ?? null;
    const next = messages[i + 1] ?? null;

    const msgDate = new Date(msg.created_at);
    const prevDate = prev ? new Date(prev.created_at) : null;

    const isGroupedPrev =
      !!prev &&
      prev.sender_id === msg.sender_id &&
      msg.status !== 'sending' &&
      msgDate.getTime() - (prevDate?.getTime() ?? 0) < GROUP_GAP_MS;

    const isGroupedNext =
      !!next &&
      next.sender_id === msg.sender_id &&
      new Date(next.created_at).getTime() - msgDate.getTime() < GROUP_GAP_MS;

    const showDate =
      !prev ||
      new Date(prev.created_at).toDateString() !== msgDate.toDateString();

    return {
      ...msg,
      isGroupedPrev,
      isGroupedNext,
      showDate,
      dateLabel: formatDateLabel(msgDate),
    };
  });
}
