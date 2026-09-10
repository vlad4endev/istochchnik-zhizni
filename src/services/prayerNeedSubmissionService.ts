import { query } from '../config/db';
import { sendTelegramByPurpose } from './telegramService';
import { newTelegramSendBatchId } from './telegramSendLogService';
import { resolvePrayerPlanWeekTimeZone } from '../utils/prayerPlanTimeZone';

/** Нижняя граница — чтобы в чат не уходили «...» и случайные нажатия. */
export const PRAYER_NEED_SUBMISSION_MIN_LENGTH = 5;
/** Верхняя граница с запасом до лимита Telegram (4096 символов на сообщение). */
export const PRAYER_NEED_SUBMISSION_MAX_LENGTH = 2000;

export interface PrayerNeedSubmissionResult {
  chat_id: string;
  member_name: string;
  text: string;
}

interface MemberNameRow {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

/** «Фамилия Имя» — как в списках участников (web: `memberRosterName`). */
function resolveMemberDisplayName(row: MemberNameRow | undefined, memberId: number): string {
  const first = (row?.first_name ?? '').trim();
  const last = (row?.last_name ?? '').trim();
  const full = (row?.name ?? '').trim();
  if (first && last) {
    return `${last} ${first}`;
  }
  if (full) {
    return full;
  }
  const single = first || last;
  return single || `Участник #${memberId}`;
}

function formatSubmittedAt(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: resolvePrayerPlanWeekTimeZone(),
  }).format(date);
}

/** Единый вид сообщения в чате: от кого, когда и сама нужда. */
export function buildPrayerNeedChatMessage(args: {
  memberName: string;
  text: string;
  submittedAt?: Date;
}): string {
  return [
    '🙏 Молитвенная нужда',
    '',
    `👤 От кого: ${args.memberName}`,
    `🗓 Отправлено: ${formatSubmittedAt(args.submittedAt ?? new Date())}`,
    '',
    'Нужда:',
    args.text.trim(),
  ].join('\n');
}

/** Текст нужды от участника: нормализация переносов и пробелов перед проверкой длины. */
export function normalizePrayerNeedText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function loadMemberDisplayName(memberId: number): Promise<string> {
  const result = await query(
    'SELECT name, first_name, last_name FROM members WHERE id = $1 LIMIT 1',
    [memberId],
  );
  return resolveMemberDisplayName(result.rows[0] as MemberNameRow | undefined, memberId);
}

/**
 * Нужда участника уходит в молитвенный Telegram-чат («Молитвенный календарь ИЖ»),
 * который задан в админке как чат с ролью «Молитва» (`telegram_prayer_chat_id`).
 */
export async function submitPrayerNeedToPrayerChat(args: {
  memberId: number;
  text: string;
}): Promise<PrayerNeedSubmissionResult> {
  const text = normalizePrayerNeedText(args.text);
  if (text.length < PRAYER_NEED_SUBMISSION_MIN_LENGTH) {
    throw new Error('prayer_need_text_too_short');
  }
  if (text.length > PRAYER_NEED_SUBMISSION_MAX_LENGTH) {
    throw new Error('prayer_need_text_too_long');
  }

  const memberName = await loadMemberDisplayName(args.memberId);
  const message = buildPrayerNeedChatMessage({ memberName, text });

  const sent = await sendTelegramByPurpose({
    purpose: 'prayer',
    text: message,
    log: {
      channel: 'prayer_need_submission',
      trigger: 'event',
      batchId: newTelegramSendBatchId(),
      memberId: args.memberId,
      memberName,
      recipientType: 'telegram_chat',
      kind: 'prayer_need_submission',
    },
  });

  return { chat_id: sent.chat_id, member_name: memberName, text };
}
