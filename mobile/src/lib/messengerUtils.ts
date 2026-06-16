import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';

import type { ConversationListItem, MessagePayloadType, MessageWithSender } from '../api/messenger';

const AVATAR_COLORS = [
  '#C0392B',
  '#E67E22',
  '#D35400',
  '#F1C40F',
  '#27AE60',
  '#16A085',
  '#2980B9',
  '#8E44AD',
  '#2C3E50',
  '#7F8C8D',
  '#7D3640',
  '#5C2830',
];

const GAP_BETWEEN_DIGITS =
  /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/u;

export function normalizeChatDisplayText(text: string): string {
  if (!text) return text;
  let s = text.normalize('NFKC');
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  );
  s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
  let prev = '';
  const digitGap = new RegExp(`(\\d)${GAP_BETWEEN_DIGITS.source}+(\\d)`, 'gu');
  while (prev !== s) {
    prev = s;
    s = s.replace(digitGap, '$1$2');
  }
  s = s.replace(/(\d{1,2})\s*:\s*(\d{1,2})/g, '$1:$2');
  return s;
}

export function getAvatarColor(seed: string): string {
  const value = String(seed || '');
  if (!value) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function getAvatarInitial(text: string | null | undefined, fallback = '?'): string {
  const normalized = String(text ?? '').trim();
  return (normalized.charAt(0) || fallback).toUpperCase();
}

export function getConversationTitle(conv: ConversationListItem): string {
  if (conv.type === 'private' && conv.other_member) {
    const fn = (conv.other_member.first_name || '').trim();
    const ln = (conv.other_member.last_name || '').trim();
    const full = `${fn} ${ln}`.trim();
    return full || conv.other_member.name || 'Личный чат';
  }
  return conv.title || 'Групповой чат';
}

export function getConversationAvatarUrl(conv: ConversationListItem): string | null {
  if (conv.type === 'private') {
    return conv.other_member?.avatar_url ?? null;
  }
  return conv.avatar_url;
}

export function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) {
    return format(d, 'HH:mm');
  }
  if (isYesterday(d)) {
    return 'вчера';
  }
  const diff = Date.now() - d.getTime();
  if (diff < 7 * 86_400_000) {
    return format(d, 'EEE', { locale: ru });
  }
  return format(d, 'd MMM', { locale: ru });
}

export function formatMessageTime(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}

const PAYLOAD_LABELS: Record<MessagePayloadType, string> = {
  text: '',
  prayer_request: '🙏 Молитвенная нужда',
  audio: '🎤 Голосовое сообщение',
  video_note: '📹 Видеосообщение',
  image: '📷 Фото',
  file: '📎 Файл',
  poll: '📊 Опрос',
  access_request: '🔐 Запрос доступа',
};

export function messagePreviewText(msg: MessageWithSender | ConversationListItem['last_message']): string {
  if (!msg) return 'Нет сообщений';
  if (msg.is_deleted) return 'Сообщение удалено';
  const payloadType = 'payload_type' in msg ? msg.payload_type : undefined;
  if (payloadType && payloadType !== 'text') {
    const label = PAYLOAD_LABELS[payloadType];
    if (label) return label;
  }
  const content = normalizeChatDisplayText(String(msg.content || '').trim());
  return content || 'Сообщение';
}

export function lastMessagePreview(
  conv: ConversationListItem,
  currentMemberId: number | null,
): string {
  const last = conv.last_message;
  if (!last) return 'Нет сообщений';
  const preview = messagePreviewText(last);
  const fromMe =
    last.sender_id != null &&
    currentMemberId != null &&
    Number(last.sender_id) === Number(currentMemberId);
  if (fromMe || conv.type === 'private') return preview;
  const firstName = last.sender_name?.split(' ')[0];
  return firstName ? `${firstName}: ${preview}` : preview;
}

export function compareMessageIds(a: string, b: string): number {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) {
    try {
      const diff = BigInt(a) - BigInt(b);
      if (diff < 0n) return -1;
      if (diff > 0n) return 1;
      return 0;
    } catch {
      /* fall through */
    }
  }
  return a.localeCompare(b);
}

export function sortMessagesChronological(messages: MessageWithSender[]): MessageWithSender[] {
  return [...messages].sort((a, b) => compareMessageIds(a.id, b.id));
}

export function createClientMsgId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
