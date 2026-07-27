import { memo, useState, useRef, useMemo, useEffect, useCallback, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { handleMessengerTextCopy, messengerTextForCopy, normalizeChatDisplayText } from '../normalizeChatDisplayText';
import { renderMessengerPlainText } from '../messengerPlainText';
import { useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../chatStore';
import {
  buildMessengerAttachmentFileUrl,
  fetchMessageAttachmentUrl,
  type MessageWithSender,
} from '../api/messengerApi';
import {
  getAlbumImageUrl,
  getPrimaryAttachmentUrl,
  inferMessengerPayloadType,
  isMessengerVideoAttachment,
  isMessengerWebmLikeVideo,
  readMessengerVideoDurationSec,
} from '../payloadMedia';
import { apiErrorMessage, approveAccessRequest, rejectAccessRequest } from '../../admin/api';
import { IoCheckmark, IoCheckmarkDone } from 'react-icons/io5';
import { LuBot, LuDownload, LuExternalLink, LuFileText, LuLoader, LuReply, LuX } from 'react-icons/lu';
import { isAssistantBotMessage } from '../messengerChannelKinds';
import {
  assistantMarkdownToPlainText,
  renderAssistantMessageContent,
} from '../assistantMessageFormat';
import { VoiceMessageAttachment } from './VoiceMessageAttachment';
import { VideoNoteAttachment } from './VideoNoteAttachment';
import { ChatVideoAttachmentPreview } from './ChatVideoAttachmentPreview';
import { MessengerPollCard } from './MessengerPollCard';
import { MessageReadersSheet } from './MessageReadersSheet';
import { ForwardMessageSheet } from './ForwardMessageSheet';
import { useMediaViewer, type MediaItem } from '../../../components/MediaViewer';
import { DocumentViewerModal, canPreviewDocumentInline } from '../../../components/DocumentViewerModal';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { emitAppToast } from '../../../lib/uiFeedback';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

function MentionRichText({
  text,
  namesById,
  isMine,
}: {
  text: string;
  namesById?: Record<number, string>;
  isMine: boolean;
}) {
  const normalizedText = useMemo(() => normalizeChatDisplayText(text), [text]);
  const linkClassName = isMine
    ? 'break-all font-semibold text-sky-100 underline decoration-white/40 underline-offset-2'
    : undefined;
  const parts = normalizedText.split(/(@\[[^\]]+\]\(\d+\)|@\[\d+\])/g);
  return (
    <span className="mention-rich-text messenger-bidi-text">
      {parts.map((part, i) => {
        const mFriendly = part.match(/^@\[([^\]]+)\]\((\d+)\)$/);
        if (mFriendly) {
          const id = Number(mFriendly[2]);
          const embedded = String(mFriendly[1] || '').trim();
          const name = embedded || namesById?.[id] || `участник ${id}`;
          return (
            <span
              key={i}
              className={['font-semibold', isMine ? 'text-sky-100 underline decoration-white/40' : 'text-primary'].join(
                ' ',
              )}
            >
              @{name}
            </span>
          );
        }
        const m = part.match(/^@\[(\d+)\]$/);
        if (!m) {
          return (
            <span key={i}>{renderMessengerPlainText(part, `p${i}`, linkClassName)}</span>
          );
        }
        const id = Number(m[1]);
        const name = namesById?.[id] ?? `участник ${id}`;
        return (
          <span
            key={i}
            className={['font-semibold', isMine ? 'text-sky-100 underline decoration-white/40' : 'text-primary'].join(' ')}
          >
            @{name}
          </span>
        );
      })}
    </span>
  );
}

function AccessRequestMessengerCard({
  message,
  isMine,
  isOptimistic,
}: {
  message: MessageWithSender;
  isMine: boolean;
  isOptimistic: boolean;
}) {
  const qc = useQueryClient();
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const requestId = Number(payload.access_request_id);
  const kind = String(payload.kind ?? '');
  const resolution = String(payload.resolution ?? '').trim();
  const fn = String(payload.first_name ?? '').trim();
  const ln = String(payload.last_name ?? '').trim();
  const nameFromParts = `${fn} ${ln}`.trim();
  const full = String(payload.full_name ?? '').trim() || nameFromParts || '—';
  const phone = String(payload.phone_number ?? '').trim() || '—';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isRegistration = kind === 'registration';
  const isPending = resolution !== 'approved' && resolution !== 'rejected';

  const run = async (action: 'approve' | 'approve_parishioner' | 'reject') => {
    if (!Number.isFinite(requestId)) return;
    setBusy(true);
    setErr(null);
    try {
      if (action === 'approve') await approveAccessRequest(requestId);
      else if (action === 'approve_parishioner')
        await approveAccessRequest(requestId, undefined, { app_role: 'parishioner' });
      else await rejectAccessRequest(requestId);
      void qc.invalidateQueries({ queryKey: ['admin', 'access-requests'] });
    } catch (e) {
      setErr(
        apiErrorMessage(
          e,
          action === 'reject'
            ? 'Не удалось отклонить'
            : 'Не удалось принять',
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const muted = isMine ? 'text-white/80' : 'text-[var(--text-secondary)]';
  const qCls = isMine ? 'text-white' : 'text-[var(--text)]';

  if (isOptimistic) {
    return <span className={qCls}>Заявка…</span>;
  }

  return (
    <div className="w-full max-w-[22rem] space-y-3">
      <div className={['text-xs font-extrabold tracking-wide', muted].join(' ')}>Новый пользователь</div>
      <div
        className={[
          'space-y-2 rounded-2xl border p-3 text-sm leading-snug shadow-sm',
          isMine ? 'border-white/10 bg-white/10 backdrop-blur-sm' : 'border-gray-100 bg-[var(--surface)]',
        ].join(' ')}
      >
        <div className={['font-semibold', qCls].join(' ')}>{full}</div>
        <div className={muted}>
          <span className={['font-bold', isMine ? 'text-white/90' : 'text-[var(--text-secondary)]'].join(' ')}>
            Телефон:
          </span>{' '}
          {phone}
        </div>
        {isRegistration ? (
          <div className={['text-xs', muted].join(' ')}>Регистрация в приложении</div>
        ) : null}
      </div>

      {isPending ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !Number.isFinite(requestId)}
            onClick={() => void run('approve')}
            className={[
              'rounded-full px-4 py-2 text-sm font-extrabold transition-colors disabled:opacity-40',
              isMine ? 'bg-white text-primary' : 'bg-emerald-600 text-white hover:bg-emerald-700',
            ].join(' ')}
          >
            Принять
          </button>
          {isRegistration ? (
            <button
              type="button"
              disabled={busy || !Number.isFinite(requestId)}
              onClick={() => void run('approve_parishioner')}
              className={[
                'rounded-full px-4 py-2 text-sm font-extrabold transition-colors disabled:opacity-40',
                isMine ? 'bg-white/90 text-stone-800' : 'bg-sky-600 text-white hover:bg-sky-700',
              ].join(' ')}
            >
              Прихожанин
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy || !Number.isFinite(requestId)}
            onClick={() => void run('reject')}
            className={[
              'rounded-full px-4 py-2 text-sm font-extrabold transition-colors disabled:opacity-40',
              isMine ? 'bg-white/20 text-white hover:bg-white/28' : 'bg-stone-200 text-[var(--text)] hover:bg-stone-300',
            ].join(' ')}
          >
            Отклонить
          </button>
        </div>
      ) : (
        <p
          className={[
            'text-sm font-bold',
            resolution === 'approved' ? 'text-emerald-600' : 'text-red-600',
          ].join(' ')}
        >
          {resolution === 'approved' ? 'Заявка принята' : 'Заявка отклонена'}
        </p>
      )}
      {err ? <p className="text-xs font-semibold text-red-600">{err}</p> : null}
    </div>
  );
}

/** Первый ряд — как в Telegram: быстрый выбор при long-press. */
const QUICK_REACTION_STRIP = ['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥'];

function openUrlInNewTab(url: string): void {
  try {
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* ignore */
  }
}

function formatViewerDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

/** Сохранение на устройство: сначала blob (как в Telegram), иначе fallback через ссылку. */
async function saveUrlToDevice(url: string, filename: string): Promise<void> {
  const safeName = filename.trim() || 'file';
  try {
    const sameOrigin =
      typeof window !== 'undefined' &&
      (() => {
        try {
          return new URL(url, window.location.href).origin === window.location.origin;
        } catch {
          return false;
        }
      })();
    const res = await fetch(url, {
      mode: 'cors',
      credentials: sameOrigin ? 'include' : 'omit',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('bad status');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = safeName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

type MessengerDocTone = 'pdf' | 'word' | 'sheet' | 'slides' | 'text' | 'archive' | 'generic';

function messengerFileExtension(name: string): string {
  const base = name.trim().split(/[/\\]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

function messengerDocumentPresentation(
  name: string,
  mimeRaw: string,
): { tone: MessengerDocTone; typeLabel: string; extBadge: string } {
  const ext = messengerFileExtension(name);
  const mime = mimeRaw.split(';')[0].trim().toLowerCase();
  const extUpper = ext ? ext.toUpperCase().slice(0, 10) : '';

  if (ext === 'pdf' || mime === 'application/pdf') {
    return { tone: 'pdf', typeLabel: 'PDF', extBadge: extUpper || 'PDF' };
  }
  if (ext === 'doc' || ext === 'docx' || mime.includes('word') || mime === 'application/msword') {
    return { tone: 'word', typeLabel: 'Документ Word', extBadge: extUpper || 'DOC' };
  }
  if (
    ext === 'xls' ||
    ext === 'xlsx' ||
    ext === 'csv' ||
    ext === 'ods' ||
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime === 'text/csv'
  ) {
    return { tone: 'sheet', typeLabel: 'Таблица', extBadge: extUpper || 'XLS' };
  }
  if (ext === 'ppt' || ext === 'pptx' || mime.includes('presentation') || mime.includes('powerpoint')) {
    return { tone: 'slides', typeLabel: 'Презентация', extBadge: extUpper || 'PPT' };
  }
  if (ext === 'txt' || ext === 'md' || ext === 'rtf' || mime === 'text/plain' || mime === 'text/markdown') {
    return { tone: 'text', typeLabel: 'Текст', extBadge: extUpper || 'TXT' };
  }
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
    return { tone: 'archive', typeLabel: 'Архив', extBadge: extUpper || 'ZIP' };
  }
  if (extUpper) {
    return { tone: 'generic', typeLabel: extUpper, extBadge: extUpper };
  }
  if (mime && mime !== 'application/octet-stream') {
    const short = mime.split('/').pop() ?? mime;
    return { tone: 'generic', typeLabel: short.toUpperCase().slice(0, 12), extBadge: short.toUpperCase().slice(0, 8) };
  }
  return { tone: 'generic', typeLabel: 'Файл', extBadge: 'FILE' };
}

/** Эмодзи-логотип формата файла (декоративный: тип дублируется текстом под именем). */
const MESSENGER_FILE_FORMAT_EMOJI: Record<MessengerDocTone, string> = {
  pdf: '📕',
  word: '📘',
  sheet: '📊',
  slides: '📽️',
  text: '📄',
  archive: '📦',
  generic: '📁',
};

function MessengerFileFormatEmoji({ tone }: { tone: MessengerDocTone }): ReactNode {
  return (
    <span
      aria-hidden
      className="pointer-events-none select-none text-[1.7rem] leading-none [font-variant-emoji:emoji]"
    >
      {MESSENGER_FILE_FORMAT_EMOJI[tone]}
    </span>
  );
}

function messengerDocTileClasses(tone: MessengerDocTone, isMine: boolean): string {
  if (isMine) {
    switch (tone) {
      case 'pdf':
        return 'bg-rose-500/28 text-rose-50 ring-1 ring-white/15';
      case 'word':
        return 'bg-sky-500/25 text-sky-50 ring-1 ring-white/15';
      case 'sheet':
        return 'bg-emerald-500/25 text-emerald-50 ring-1 ring-white/15';
      case 'slides':
        return 'bg-amber-500/28 text-amber-50 ring-1 ring-white/15';
      case 'text':
        return 'bg-stone-200/20 text-white ring-1 ring-white/15';
      case 'archive':
        return 'bg-violet-500/25 text-violet-50 ring-1 ring-white/15';
      default:
        return 'bg-white/16 text-white ring-1 ring-white/15';
    }
  }
  switch (tone) {
    case 'pdf':
      return 'bg-rose-50 text-rose-600 ring-1 ring-rose-100/90';
    case 'word':
      return 'bg-sky-50 text-sky-600 ring-1 ring-sky-100/90';
    case 'sheet':
      return 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100/90';
    case 'slides':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-100/90';
    case 'text':
      return 'bg-stone-100 text-stone-600 ring-1 ring-stone-200/90';
    case 'archive':
      return 'bg-violet-50 text-violet-600 ring-1 ring-violet-100/90';
    default:
      return 'bg-[var(--surface-elevated)] text-[var(--text-secondary)] ring-1 ring-gray-100';
  }
}

const EMPTY_READ_CURSORS: Record<number, string> = {};

interface MessageBubbleProps {
  message: MessageWithSender;
  isGroupedPrev: boolean;
  isGroupedNext: boolean;
  onJumpToMessage?: (messageId: string) => void;
  /** Подписи для отображения `@[id]` как @Имя. */
  participantLabelById?: Record<number, string>;
  canPinMessages?: boolean;
  onPinToggle?: (messageId: string, nextPinned: boolean) => void | Promise<void>;
  /** Канал «Заявки»: оформление как системный бот, без ответа свайпом. */
  accessRequestsSystemChannel?: boolean;
  /** Личный чат «ИИ помощник»: шапка бота для ответов ИИ. */
  assistantChannel?: boolean;
}

function MessageBubbleInner({
  message,
  isGroupedPrev,
  isGroupedNext: _isGroupedNext,
  onJumpToMessage,
  participantLabelById,
  canPinMessages = false,
  onPinToggle,
  accessRequestsSystemChannel = false,
  assistantChannel = false,
}: MessageBubbleProps) {
  const openViewer = useMediaViewer((s) => s.openViewer);
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const convIdKey = String(message.conversation_id);
  const conversationType = useChatStore((s) => {
    const c = s.conversations.find((x) => String(x.id) === convIdKey);
    return c?.type ?? null;
  });
  const convReadCursors = useChatStore((s) => s.readCursorsByConv[convIdKey] || EMPTY_READ_CURSORS);
  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const retrySendMessage = useChatStore((s) => s.retrySendMessage);
  const [showActions, setShowActions] = useState(false);
  /** Плашка реакций над пузырьком (long-press), как в Telegram */
  const [showReactionBar, setShowReactionBar] = useState(false);
  const [showReadersSheet, setShowReadersSheet] = useState(false);
  const [showForwardSheet, setShowForwardSheet] = useState(false);
  const [documentViewer, setDocumentViewer] = useState<{ url: string; name: string; mime: string } | null>(null);
  const [mainImageLoaded, setMainImageLoaded] = useState(false);
  const [albumSlotLoaded, setAlbumSlotLoaded] = useState<Record<number, boolean>>({});
  const longPressTimer = useRef<number | null>(null);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);
  const pointerMovedRef = useRef(false);
  const suppressMenuUntilRef = useRef(0);

  const isOptimistic = message.id.startsWith('temp-');
  /** Number() — WS/API иногда отдают sender_id строкой; иначе «свои» пункты меню пропадают. */
  const isMine =
    isOptimistic ||
    (currentMemberId != null &&
      message.sender_id != null &&
      Number(message.sender_id) === Number(currentMemberId));

  const shellRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, (v: number) => {
    const t = isMine ? Math.max(0, -v) : Math.max(0, v);
    if (t < 8) return 0;
    return Math.min(1, 0.12 + ((t - 8) / 82) * 0.88);
  });
  const replyScale = useTransform(x, (v: number) => {
    const t = isMine ? Math.max(0, -v) : Math.max(0, v);
    if (t < 8) return 0.92;
    return Math.min(1, 0.92 + ((t - 8) / 82) * 0.08);
  });
  const isDeleted = message.is_deleted;
  const status = message.status ?? (isOptimistic ? 'sending' : 'sent');
  const maxOtherReadId = useMemo(() => {
    const ids = Object.values(convReadCursors);
    let max: bigint = 0n;
    for (const v of ids) {
      if (typeof v !== 'string' || !/^\d+$/.test(v)) continue;
      const b = BigInt(v);
      if (b > max) max = b;
    }
    return max;
  }, [convReadCursors]);

  const isReadByOther = useMemo(() => {
    if (!isMine || isOptimistic) return false;
    if (!/^\d+$/.test(message.id)) return false;
    return BigInt(message.id) <= maxOtherReadId;
  }, [isMine, isOptimistic, message.id, maxOtherReadId]);

  /** Список «кто прочитал» — только свои сообщения в группе/канале. */
  const canViewReaders =
    isMine &&
    !isOptimistic &&
    !isDeleted &&
    /^\d+$/.test(String(message.id)) &&
    (conversationType === 'group' || conversationType === 'channel');

  const openReadersSheet = useCallback(() => {
    if (!canViewReaders) return;
    setShowActions(false);
    setShowReactionBar(false);
    setShowReadersSheet(true);
  }, [canViewReaders]);

  const openForwardSheet = useCallback(() => {
    if (isOptimistic || isDeleted || !/^\d+$/.test(String(message.id))) return;
    setShowActions(false);
    setShowReactionBar(false);
    setShowForwardSheet(true);
  }, [isOptimistic, isDeleted, message.id]);

  const formattedTime = useMemo(() => {
    const d = new Date(message.created_at);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, [message.created_at]);

  const payloadType = useMemo(() => inferMessengerPayloadType(message), [
    message.payload,
    message.payload_type,
    (message as MessageWithSender & { payloadType?: string }).payloadType,
    (message as MessageWithSender & { type?: string }).type,
    message.image_url,
    message.imageUrl,
  ]);
  const systemBotAccessMessage =
    accessRequestsSystemChannel &&
    payloadType === 'access_request' &&
    message.sender_id == null &&
    !isDeleted;
  const payload = useMemo(() => {
    const raw = message.payload;
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
    return {} as Record<string, unknown>;
  }, [message.payload]);
  const systemBotAssistantMessage =
    !isDeleted &&
    !isMine &&
    (isAssistantBotMessage(payload, message.sender_id) ||
      (assistantChannel && message.sender_id == null));

  const forwardedFromLabel = useMemo(() => {
    const raw = message.forwarded_from;
    if (raw == null) return null;
    let obj: unknown = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        return null;
      }
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
    const name = String((obj as { sender_name?: unknown }).sender_name ?? '').trim();
    return name || 'сообщения';
  }, [message.forwarded_from]);

  const canForwardMessage =
    !isOptimistic &&
    !isDeleted &&
    !systemBotAccessMessage &&
    /^\d+$/.test(String(message.id)) &&
    payloadType !== 'access_request';

  const canEditOwnMessage =
    isMine &&
    !isOptimistic &&
    !isDeleted &&
    !systemBotAccessMessage &&
    payloadType !== 'poll' &&
    payloadType !== 'access_request';

  /** Свои + системные (рассылка и т.п. без sender_id), кроме заявок. */
  const canDeleteMessage =
    !isDeleted &&
    !isOptimistic &&
    !systemBotAccessMessage &&
    payloadType !== 'access_request' &&
    (isMine || message.sender_id == null);

  const senderName = String(
    message.sender_name ??
      [message.sender_first_name, message.sender_last_name].filter(Boolean).join(' ') ??
      '',
  ).trim() || (systemBotAssistantMessage ? 'ИИ помощник' : 'Неизвестно');
  const viewerDate = useMemo(() => formatViewerDate(message.created_at), [message.created_at]);
  const viewerSender = useMemo(
    () => ({
      name: senderName,
      initials: initialsFromName(senderName),
    }),
    [senderName],
  );
  const albumImages = Array.isArray(payload.images)
    ? payload.images
        .map((x) => (typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null))
        .filter((x): x is Record<string, unknown> => Boolean(x))
    : [];
  const firstAlbumImage = albumImages[0] ?? null;
  const topLevelImageUrl = String(message.image_url ?? message.imageUrl ?? '').trim();
  const attachmentRawUrl = (() => {
    const direct = getPrimaryAttachmentUrl(payload);
    if (direct) return direct;
    if (topLevelImageUrl) return topLevelImageUrl;
    if (firstAlbumImage) return getAlbumImageUrl(firstAlbumImage);
    return '';
  })();
  useEffect(() => {
    setMainImageLoaded(false);
    setAlbumSlotLoaded({});
  }, [attachmentRawUrl, message.id]);
  const attachmentObjectPath = String(payload.object_path ?? payload.objectPath ?? '').trim();
  const [resolvedAttachmentUrl, setResolvedAttachmentUrl] = useState<string | null>(null);
  /** Подписанные URL по кадру альбома (раньше альбом не ходил в attachment-url — фото «протухали»). */
  const [resolvedAlbumUrls, setResolvedAlbumUrls] = useState<Record<number, string>>({});
  const [imgFailed, setImgFailed] = useState(false);
  const [albumSlotFailed, setAlbumSlotFailed] = useState<Record<number, boolean>>({});
  const fetchedRef = useRef(false);

  const albumFetchSig = useMemo(() => JSON.stringify(payload.images ?? []), [payload.images]);

  useEffect(() => {
    fetchedRef.current = false;
    setImgFailed(false);
    setAlbumSlotFailed({});
    setResolvedAlbumUrls({});
  }, [message.id]);

  useEffect(() => {
    if (payloadType !== 'image' && payloadType !== 'file' && payloadType !== 'audio' && payloadType !== 'video_note')
      return undefined;
    if (payloadType === 'image' && albumImages.length > 0) return undefined;
    if (!/^\d+$/.test(String(message.id))) return undefined;
    if (fetchedRef.current) return undefined;

    const fallback = attachmentRawUrl ? (resolvePublicUrl(attachmentRawUrl) ?? attachmentRawUrl) : null;
    setResolvedAttachmentUrl(fallback);

    let cancelled = false;
    fetchedRef.current = true;
    const maxAttempts = 3;

    async function tryFetchSignedUrl(): Promise<void> {
      if (payloadType === 'file') return;
      for (let attempt = 1; attempt <= maxAttempts && !cancelled; attempt += 1) {
        try {
          const { url } = await fetchMessageAttachmentUrl(String(message.id));
          if (cancelled || !url) return;
          const resolved = resolvePublicUrl(url) ?? url;
          if (resolved) setResolvedAttachmentUrl(resolved);
          return;
        } catch {
          if (attempt < maxAttempts && !cancelled) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
          }
        }
      }
    }

    void tryFetchSignedUrl();
    return () => {
      cancelled = true;
      fetchedRef.current = false;
    };
  }, [message.id, attachmentObjectPath, attachmentRawUrl, payloadType, albumImages.length]);

  useEffect(() => {
    if (payloadType !== 'image' || albumImages.length === 0) return undefined;
    if (!/^\d+$/.test(String(message.id))) return undefined;

    let cancelled = false;
    void (async () => {
      for (let idx = 0; idx < albumImages.length; idx += 1) {
        if (cancelled) return;
        const rawUrl = getAlbumImageUrl(albumImages[idx]);
        const fallback = rawUrl ? (resolvePublicUrl(rawUrl) ?? rawUrl) : '';
        if (fallback) {
          setResolvedAlbumUrls((prev) => ({ ...prev, [idx]: fallback }));
        }
        for (let attempt = 1; attempt <= 3 && !cancelled; attempt += 1) {
          try {
            const { url } = await fetchMessageAttachmentUrl(String(message.id), idx);
            if (cancelled || !url) break;
            const resolved = resolvePublicUrl(url) ?? url;
            if (resolved) setResolvedAlbumUrls((prev) => ({ ...prev, [idx]: resolved }));
            break;
          } catch {
            if (attempt < 3 && !cancelled) {
              await new Promise((r) => setTimeout(r, 1000 * attempt));
            }
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [message.id, payloadType, albumFetchSig, albumImages.length]);

  /** Время и галочки в одной строке с текстом (как в Telegram), если нет цитаты и не «особый» контент. */
  const useInlineTextMeta =
    !isDeleted &&
    !message.reply_preview &&
    payloadType === 'text' &&
    !message.is_pinned;

  const isVideoNoteLayout = payloadType === 'video_note' && !isDeleted;
  const persistedNumericId = /^\d+$/.test(String(message.id));
  const videoNoteMedia = useMemo(() => {
    if (!isVideoNoteLayout) return null;
    const videoMime = String(payload.mimeType ?? payload.mimetype ?? '').trim().toLowerCase();
    const isWebmLike = isMessengerWebmLikeVideo(attachmentRawUrl, videoMime);
    const mp4Proxy =
      persistedNumericId && isWebmLike
        ? buildMessengerAttachmentFileUrl(String(message.id), { transcode: 'mp4' })
        : null;
    const raw = attachmentRawUrl;
    const fallback = raw ? (resolvePublicUrl(raw) ?? raw) : '';
    const proxied = persistedNumericId ? buildMessengerAttachmentFileUrl(String(message.id)) : null;
    const originalChain = proxied || resolvedAttachmentUrl || fallback || null;
    const wantsMp4First = Boolean(mp4Proxy);
    let primary: string | null;
    let fallbackSrc: string | null;
    if (wantsMp4First && mp4Proxy) {
      primary = mp4Proxy;
      fallbackSrc = originalChain && originalChain !== mp4Proxy ? originalChain : null;
    } else {
      primary = originalChain;
      fallbackSrc = mp4Proxy && mp4Proxy !== primary ? mp4Proxy : null;
    }
    return { primary, fallbackSrc };
  }, [isVideoNoteLayout, payload.mimeType, payload.mimetype, attachmentRawUrl, resolvedAttachmentUrl, persistedNumericId, message.id]);

  const videoNoteDurationSec = useMemo(() => {
    if (!isVideoNoteLayout) return undefined;
    const durRaw = payload.durationSec ?? payload.duration_sec;
    const n = typeof durRaw === 'number' && Number.isFinite(durRaw) ? durRaw : Number(durRaw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [isVideoNoteLayout, payload.durationSec, payload.duration_sec]);

  const videoNoteCaption = useMemo(() => {
    if (!isVideoNoteLayout) return '';
    return String(message.content ?? '').trim();
  }, [isVideoNoteLayout, message.content]);

  const handlePrayClick = () => {
    // Этап 2: заглушка для интерактивной карточки
    // В Этапе 3/следующих этапах подключим API + WS синк.
    // eslint-disable-next-line no-console
    console.log('[messenger] pray click', { messageId: message.id });
  };

  const openDocument = useCallback((url: string, name: string, mimeHint: string) => {
    if (!url) return;
    if (canPreviewDocumentInline(name, mimeHint)) {
      setDocumentViewer({ url, name, mime: mimeHint });
      return;
    }
    openUrlInNewTab(url);
  }, []);

  const buildAlbumViewer = useCallback((): {
    items: MediaItem[];
    indexBySource: Record<number, number>;
  } => {
    const items: MediaItem[] = [];
    const indexBySource: Record<number, number> = {};
    const caption = String(message.content ?? '').trim();

    albumImages.forEach((img, idx) => {
      const rawUrl = getAlbumImageUrl(img);
      const src = resolvedAlbumUrls[idx] ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
      if (!src) return;
      const mime = String(img.mimeType ?? img.mimetype ?? '').trim().toLowerCase();
      const name = String(img.name ?? img.filename ?? '').trim().toLowerCase();
      const urlPath = rawUrl.split('?')[0].toLowerCase();
      const isHeicLike =
        mime === 'image/heic' ||
        mime === 'image/heif' ||
        urlPath.endsWith('.heic') ||
        urlPath.endsWith('.heif') ||
        name.endsWith('.heic') ||
        name.endsWith('.heif');
      if (isHeicLike) return;

      const mediaType: MediaItem['type'] = isMessengerVideoAttachment(img as Record<string, unknown>, rawUrl)
        ? 'video'
        : 'photo';
      let playbackSrc = src;
      if (
        mediaType === 'video' &&
        persistedNumericId &&
        isMessengerWebmLikeVideo(rawUrl, mime)
      ) {
        playbackSrc = buildMessengerAttachmentFileUrl(String(message.id), { slot: idx, transcode: 'mp4' });
      }
      indexBySource[idx] = items.length;
      items.push({
        id: `${message.id}-${idx}`,
        type: mediaType,
        src: playbackSrc,
        thumb: mediaType === 'photo' ? src : undefined,
        caption,
        sender: viewerSender,
        date: viewerDate,
      });
    });

    return { items, indexBySource };
  }, [albumImages, message.content, message.id, persistedNumericId, resolvedAlbumUrls, viewerDate, viewerSender]);

  const renderContent = () => {
    if (payloadType === 'video_note') return null;

    if (payloadType === 'poll') {
      return <MessengerPollCard message={message} isMine={isMine} isOptimistic={isOptimistic} />;
    }

    if (payloadType === 'access_request') {
      return <AccessRequestMessengerCard message={message} isMine={isMine} isOptimistic={isOptimistic} />;
    }

    if (payloadType === 'prayer_request') {
      const text = String(
        payload.text ?? payload.request ?? payload.content ?? message.content ?? '',
      ).trim();
      const count = Number(message.interaction_count ?? payload.count ?? 0);

      return (
        <div className="w-full max-w-[22rem]">
          <div
            className={[
              'rounded-2xl border p-3 shadow-sm',
              isMine ? 'border-white/10 bg-white/10 backdrop-blur-sm' : 'border-gray-100 bg-[var(--surface)]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={['text-xs font-extrabold tracking-wide', isMine ? 'text-white/75' : 'text-[var(--text-secondary)]'].join(' ')}>
                  Молитвенная нужда
                </div>
                <div className={['mt-1 whitespace-pre-wrap break-words text-sm leading-5 messenger-bidi-text', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
                  {text ? renderMessengerPlainText(text, 'prayer') : '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrayClick}
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-200 active:scale-[0.99]',
                  isMine
                    ? 'bg-white/10 text-white/95 hover:bg-white/15'
                    : 'bg-primary/10 text-primary hover:bg-primary/15',
                ].join(' ')}
              >
                <span aria-hidden>🙏</span>
                <span>Я молюсь</span>
                <span className={['rounded-full px-2 py-0.5 text-xs font-bold', isMine ? 'bg-white/15' : 'bg-primary/15'].join(' ')}>
                  {Number.isFinite(count) ? count : 0}
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (payloadType === 'story_reply') {
      const storyUrl = resolvePublicUrl(
        String(payload.story_media_url ?? payload.media_url ?? '').trim(),
      );
      const storyType = String(payload.story_media_type ?? '').trim() === 'video' ? 'video' : 'image';
      const replyText = String(
        payload.text ?? message.content ?? '',
      ).trim();
      const reaction = String(payload.reaction ?? '').trim();
      const kind = String(payload.kind ?? '').trim();
      const showAsReaction = kind === 'reaction' || (Boolean(reaction) && !String(payload.text ?? '').trim());
      const display = showAsReaction ? reaction || replyText : replyText || reaction;

      return (
        <div className="w-full max-w-[min(78vw,18rem)]">
          <div
            className={[
              'overflow-hidden rounded-2xl border',
              isMine ? 'border-white/15 bg-white/10' : 'border-stone-200/80 bg-[var(--surface)]',
            ].join(' ')}
          >
            <div className="flex gap-2.5 p-2">
              <div
                className={[
                  'relative h-[4.5rem] w-[3.2rem] shrink-0 overflow-hidden rounded-xl bg-stone-900/80',
                  isMine ? 'ring-1 ring-white/20' : 'ring-1 ring-stone-200/70',
                ].join(' ')}
              >
                {storyUrl ? (
                  storyType === 'video' ? (
                    <video
                      src={storyUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={storyUrl} alt="" className="h-full w-full object-cover" />
                  )
                ) : null}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1 pb-0.5 pt-3 text-[9px] font-bold uppercase tracking-wide text-white/90">
                  Story
                </span>
              </div>
              <div className="min-w-0 flex-1 self-center py-0.5">
                <div
                  className={[
                    'text-[11px] font-bold tracking-wide',
                    isMine ? 'text-white/70' : 'text-[var(--text-secondary)]',
                  ].join(' ')}
                >
                  {showAsReaction ? 'Реакция на историю' : 'Ответ на историю'}
                </div>
                <div
                  className={[
                    'mt-1 break-words leading-snug messenger-bidi-text',
                    showAsReaction ? 'text-2xl' : 'text-sm',
                    isMine ? 'text-white/95' : 'text-[var(--text)]',
                  ].join(' ')}
                >
                  {display || '↩️'}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (payloadType === 'image') {
      if (albumImages.length > 0) {
        const caption = String(message.content ?? '').trim();
        const colsClass = albumImages.length === 1 ? 'grid-cols-1' : albumImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
        return (
          <div className="w-full max-w-[min(78vw,22rem)] overflow-hidden rounded-2xl">
            <div className={['grid gap-1.5', colsClass].join(' ')}>
              {albumImages.map((img, idx) => {
                const rawUrl = getAlbumImageUrl(img);
                const slideSrc = resolvedAlbumUrls[idx] ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
                const mime = String(img.mimeType ?? img.mimetype ?? '').trim().toLowerCase();
                const name = String(img.name ?? img.filename ?? '').trim().toLowerCase();
                const urlPath = rawUrl.split('?')[0].toLowerCase();
                const isAlbumVideo = isMessengerVideoAttachment(img as Record<string, unknown>, rawUrl);
                const albumVideoSrc =
                  isAlbumVideo &&
                  persistedNumericId &&
                  isMessengerWebmLikeVideo(rawUrl, mime)
                    ? buildMessengerAttachmentFileUrl(String(message.id), { slot: idx, transcode: 'mp4' })
                    : slideSrc;
                const isHeicLike =
                  mime === 'image/heic' ||
                  mime === 'image/heif' ||
                  urlPath.endsWith('.heic') ||
                  urlPath.endsWith('.heif') ||
                  name.endsWith('.heic') ||
                  name.endsWith('.heif');
                if (!slideSrc) return null;
                if (isHeicLike) {
                  const dlName =
                    String(img.name ?? img.filename ?? '').trim() || `photo-${idx + 1}.heic`;
                  return (
                    <div
                      key={`${slideSrc}-${idx}-heic`}
                      className={[
                        'flex min-h-[84px] flex-col items-stretch justify-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold',
                        isMine ? 'bg-white/10 text-white/90' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
                      ].join(' ')}
                    >
                      <span className="text-center">HEIC</span>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openUrlInNewTab(slideSrc);
                          }}
                          className={[
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                            isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
                          ].join(' ')}
                        >
                          <LuExternalLink size={14} />
                          Открыть
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void saveUrlToDevice(slideSrc, dlName).catch(() =>
                              emitAppToast({ kind: 'error', message: 'Не удалось сохранить файл' }),
                            );
                          }}
                          className={[
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                            isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
                          ].join(' ')}
                        >
                          <LuDownload size={14} />
                          Сохранить
                        </button>
                      </div>
                    </div>
                  );
                }
                if (isMessengerVideoAttachment(img as Record<string, unknown>, rawUrl)) {
                  if (albumSlotFailed[idx]) {
                    return (
                      <div
                        key={`${albumVideoSrc}-${idx}-video-failed`}
                        className={[
                          'flex min-h-[84px] items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold',
                          isMine ? 'bg-white/10 text-white/75' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
                        ].join(' ')}
                      >
                        <LuFileText size={16} aria-hidden />
                        <span>Видео недоступно</span>
                      </div>
                    );
                  }
                  const videoDur = readMessengerVideoDurationSec(img as Record<string, unknown>);
                  return (
                    <button
                      key={`${albumVideoSrc}-${idx}-video`}
                      type="button"
                      onClick={() => {
                        const { items, indexBySource } = buildAlbumViewer();
                        const targetIndex = indexBySource[idx];
                        if (targetIndex == null || items.length === 0) return;
                        openViewer(items, targetIndex);
                      }}
                      className={['relative overflow-hidden rounded-xl', isMine ? 'bg-white/10' : 'bg-black/[0.04]'].join(' ')}
                      style={{ aspectRatio: '4 / 3' }}
                      aria-label={`Открыть видео ${idx + 1}`}
                    >
                      {!albumSlotLoaded[idx] ? (
                        <span
                          className={[
                            'absolute inset-0 animate-pulse',
                            isMine ? 'bg-white/10' : 'bg-[var(--surface)]',
                          ].join(' ')}
                          aria-hidden
                        />
                      ) : null}
                      <ChatVideoAttachmentPreview
                        src={albumVideoSrc}
                        isMine={isMine}
                        durationHintSec={videoDur}
                        videoClassName={[
                          'h-full w-full object-cover transition-opacity duration-200',
                          albumSlotLoaded[idx] ? 'opacity-100' : 'opacity-0',
                        ].join(' ')}
                        onLoaded={() => setAlbumSlotLoaded((prev) => ({ ...prev, [idx]: true }))}
                        onError={() => setAlbumSlotFailed((prev) => ({ ...prev, [idx]: true }))}
                      />
                    </button>
                  );
                }
                if (albumSlotFailed[idx]) {
                  return (
                    <div
                      key={`${slideSrc}-${idx}-failed`}
                      className={[
                        'flex min-h-[84px] items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold',
                        isMine ? 'bg-white/10 text-white/75' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
                      ].join(' ')}
                    >
                      <LuFileText size={16} aria-hidden />
                      <span>Фото недоступно</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={`${slideSrc}-${idx}`}
                    type="button"
                    onClick={() => {
                      const { items, indexBySource } = buildAlbumViewer();
                      const targetIndex = indexBySource[idx];
                      if (targetIndex == null || items.length === 0) return;
                      openViewer(items, targetIndex);
                    }}
                    className={['relative overflow-hidden rounded-xl', isMine ? 'bg-white/10' : 'bg-black/[0.04]'].join(' ')}
                    style={{ aspectRatio: '4 / 3' }}
                    aria-label={`Открыть изображение ${idx + 1}`}
                  >
                    {!albumSlotLoaded[idx] ? (
                      <span
                        className={[
                          'absolute inset-0 animate-pulse',
                          isMine ? 'bg-white/10' : 'bg-[var(--surface)]',
                        ].join(' ')}
                        aria-hidden
                      />
                    ) : null}
                    <img
                      src={slideSrc}
                      alt=""
                      className={[
                        'h-full w-full object-cover transition-opacity duration-200',
                        albumSlotLoaded[idx] ? 'opacity-100' : 'opacity-0',
                      ].join(' ')}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onLoad={() => setAlbumSlotLoaded((prev) => ({ ...prev, [idx]: true }))}
                      onError={() => setAlbumSlotFailed((prev) => ({ ...prev, [idx]: true }))}
                    />
                  </button>
                );
              })}
            </div>
            {caption ? (
              <div className={['px-3 py-2 text-sm leading-relaxed', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
                <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
              </div>
            ) : null}
          </div>
        );
      }

      const rawUrl = attachmentRawUrl;
      const attachmentProxyHref = persistedNumericId
        ? buildMessengerAttachmentFileUrl(String(message.id))
        : null;
      const src = attachmentProxyHref || resolvedAttachmentUrl || (resolvePublicUrl(rawUrl) ?? rawUrl);
      const caption = String(message.content ?? '').trim();
      const attachmentMime = String(payload.mimeType ?? payload.mimetype ?? '').trim().toLowerCase();
      const singleVideoPlaybackSrc =
        persistedNumericId && isMessengerWebmLikeVideo(rawUrl, attachmentMime)
          ? buildMessengerAttachmentFileUrl(String(message.id), { transcode: 'mp4' })
          : src;
      const attachmentName = String(payload.name ?? payload.filename ?? '').trim().toLowerCase();
      const urlPath = rawUrl.split('?')[0].toLowerCase();
      const isHeicLike =
        attachmentMime === 'image/heic' ||
        attachmentMime === 'image/heif' ||
        urlPath.endsWith('.heic') ||
        urlPath.endsWith('.heif') ||
        attachmentName.endsWith('.heic') ||
        attachmentName.endsWith('.heif');
      if (isHeicLike) {
        const heicName =
          String(payload.name ?? payload.filename ?? '').trim() || 'image.heic';
        return (
          <div
            className={[
              'flex max-w-[20rem] flex-col gap-2 rounded-2xl px-3 py-2 ring-1 transition-colors duration-200',
              isMine ? 'bg-white/10 ring-white/10' : 'bg-[var(--surface)] ring-gray-100',
            ].join(' ')}
          >
            <div className="min-w-0">
              <span className={['block truncate text-sm font-semibold', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
                HEIC/HEIF изображение
              </span>
              <span className={['mt-0.5 block text-xs font-semibold', isMine ? 'text-white/70' : 'text-[var(--text-secondary)]'].join(' ')}>
                Откройте во внешнем приложении или сохраните на устройство
              </span>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={!src}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (src) openUrlInNewTab(src);
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-40',
                  isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
                ].join(' ')}
              >
                <LuExternalLink size={14} />
                Открыть
              </button>
              <button
                type="button"
                disabled={!src}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!src) return;
                  void saveUrlToDevice(src, heicName).catch(() =>
                    emitAppToast({ kind: 'error', message: 'Не удалось сохранить файл' }),
                  );
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-40',
                  isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
                ].join(' ')}
              >
                <LuDownload size={14} />
                Сохранить
              </button>
            </div>
          </div>
        );
      }
      const isSingleVideo = isMessengerVideoAttachment(payload as Record<string, unknown>, rawUrl);
      const singleVideoDur = isSingleVideo ? readMessengerVideoDurationSec(payload as Record<string, unknown>) : undefined;
      return src ? (
        <div className="relative w-full max-w-[min(78vw,22rem)] overflow-hidden rounded-2xl" style={{ aspectRatio: '4 / 3' }}>
          {imgFailed ? (
            <div
              className={[
                'flex items-center gap-2 rounded-xl p-2 text-sm',
                isMine ? 'bg-white/10 text-white/75' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
              ].join(' ')}
            >
              <LuFileText size={16} aria-hidden />
              <span>Файл недоступен</span>
            </div>
          ) : (
            <>
              {!mainImageLoaded ? (
                <span
                  className={[
                    'absolute inset-0 animate-pulse',
                    isMine ? 'bg-white/10' : 'bg-[var(--surface)]',
                  ].join(' ')}
                  aria-hidden
                />
              ) : null}
            <button
              type="button"
              onClick={() => {
                openViewer(
                  [
                    {
                      id: message.id,
                      type: isSingleVideo ? 'video' : 'photo',
                      src: isSingleVideo ? singleVideoPlaybackSrc : src,
                      thumb: isSingleVideo ? undefined : src,
                      caption,
                      sender: viewerSender,
                      date: viewerDate,
                    },
                  ],
                  0,
                );
              }}
              className={[
                'relative block w-full overflow-hidden',
                isMine ? 'bg-white/10' : 'bg-black/[0.04]',
              ].join(' ')}
              aria-label={isSingleVideo ? 'Открыть видео' : 'Открыть изображение'}
            >
              {isSingleVideo ? (
                <ChatVideoAttachmentPreview
                  src={singleVideoPlaybackSrc}
                  isMine={isMine}
                  durationHintSec={singleVideoDur}
                  videoClassName={[
                    'h-full w-full object-cover transition-opacity duration-200',
                    mainImageLoaded ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                  onLoaded={() => setMainImageLoaded(true)}
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <img
                  src={src}
                  alt=""
                  className={[
                    'h-full w-full object-cover transition-opacity duration-200',
                    mainImageLoaded ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onLoad={() => setMainImageLoaded(true)}
                  onError={() => setImgFailed(true)}
                />
              )}
            </button>
            </>
          )}
          {caption ? (
            <div className={['px-3 py-2 text-sm leading-relaxed', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
              <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
            </div>
          ) : null}
        </div>
      ) : (
        <span>Изображение недоступно</span>
      );
    }

    if (payloadType === 'audio') {
      const rawUrl = attachmentRawUrl;
      const fallbackHref = resolvedAttachmentUrl ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
      const href = persistedNumericId
        ? buildMessengerAttachmentFileUrl(String(message.id))
        : fallbackHref;
      const caption = String(message.content ?? '').trim();
      const durRaw = payload.durationSec ?? payload.duration_sec;
      const durationHint = typeof durRaw === 'number' && Number.isFinite(durRaw) ? durRaw : Number(durRaw);
      return (
        <div className="w-full max-w-[min(85vw,280px)] space-y-2">
          <VoiceMessageAttachment
            audioSrc={href || null}
            isMine={isMine}
            durationHintSec={Number.isFinite(durationHint) && durationHint > 0 ? durationHint : undefined}
          />
          {caption ? (
            <div className={['text-sm leading-relaxed', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
              <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
            </div>
          ) : null}
        </div>
      );
    }

    if (payloadType === 'file') {
      const rawUrl = attachmentRawUrl;
      const fallbackHref = resolvedAttachmentUrl ?? (resolvePublicUrl(rawUrl) ?? rawUrl);
      const openHref = persistedNumericId
        ? buildMessengerAttachmentFileUrl(String(message.id))
        : fallbackHref;
      const saveHref = persistedNumericId
        ? buildMessengerAttachmentFileUrl(String(message.id), { download: true })
        : fallbackHref;
      const name = String(payload.name ?? payload.filename ?? message.content ?? 'Файл').trim() || 'Файл';
      const sizeRaw = Number(payload.size ?? 0);
      const sizeLabel = Number.isFinite(sizeRaw) && sizeRaw > 0 ? formatBytes(sizeRaw) : null;
      const mimeHint = String(payload.mimeType ?? payload.mimetype ?? '').trim();
      const fileVideoPlaybackHref =
        persistedNumericId && isMessengerWebmLikeVideo(rawUrl, mimeHint)
          ? buildMessengerAttachmentFileUrl(String(message.id), { transcode: 'mp4' })
          : openHref;
      const docMeta = messengerDocumentPresentation(name, mimeHint);
      const subtitleParts = [docMeta.typeLabel];
      if (sizeLabel) subtitleParts.push(sizeLabel);
      const subtitle = subtitleParts.join(' · ');
      const caption = String(message.content ?? '').trim();
      const showCaption = caption.length > 0 && caption !== name;

      const fileAsVideo = isMessengerVideoAttachment(payload as Record<string, unknown>, rawUrl);
      const fileVideoDur = fileAsVideo ? readMessengerVideoDurationSec(payload as Record<string, unknown>) : undefined;
      if (fileAsVideo && openHref) {
        return (
          <div className="relative w-full max-w-[min(78vw,22rem)] overflow-hidden rounded-2xl" style={{ aspectRatio: '4 / 3' }}>
            {imgFailed ? (
              <div
                className={[
                  'flex items-center gap-2 rounded-xl p-2 text-sm',
                  isMine ? 'bg-white/10 text-white/75' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
                ].join(' ')}
              >
                <LuFileText size={16} aria-hidden />
                <span>Видео недоступно</span>
              </div>
            ) : (
              <>
                {!mainImageLoaded ? (
                  <span
                    className={[
                      'absolute inset-0 animate-pulse',
                      isMine ? 'bg-white/10' : 'bg-[var(--surface)]',
                    ].join(' ')}
                    aria-hidden
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    openViewer(
                      [
                        {
                          id: message.id,
                          type: 'video',
                          src: fileVideoPlaybackHref,
                          caption,
                          sender: viewerSender,
                          date: viewerDate,
                        },
                      ],
                      0,
                    );
                  }}
                  className={[
                    'relative block w-full overflow-hidden',
                    isMine ? 'bg-white/10' : 'bg-black/[0.04]',
                  ].join(' ')}
                  aria-label="Открыть видео"
                >
                  <ChatVideoAttachmentPreview
                    src={fileVideoPlaybackHref}
                    isMine={isMine}
                    durationHintSec={fileVideoDur}
                    videoClassName={[
                      'h-full w-full object-cover transition-opacity duration-200',
                      mainImageLoaded ? 'opacity-100' : 'opacity-0',
                    ].join(' ')}
                    onLoaded={() => setMainImageLoaded(true)}
                    onError={() => setImgFailed(true)}
                  />
                </button>
              </>
            )}
            {caption ? (
              <div className={['px-3 py-2 text-sm leading-relaxed', isMine ? 'text-white/95' : 'text-[var(--text)]'].join(' ')}>
                <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <div
          className={[
            'flex w-full max-w-[min(92vw,20.5rem)] flex-col overflow-hidden rounded-2xl shadow-sm ring-1 transition-colors duration-200',
            isMine ? 'bg-white/10 ring-white/12' : 'bg-[var(--surface)] ring-gray-100/95',
          ].join(' ')}
        >
          <button
            type="button"
            disabled={!openHref}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (openHref) openDocument(openHref, name, mimeHint);
            }}
            className={[
              'flex w-full min-w-0 items-start gap-3 p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              isMine ? 'hover:bg-white/6 active:bg-white/10' : 'hover:bg-stone-100/80 active:bg-stone-100',
            ].join(' ')}
            aria-label={`Открыть документ ${name}`}
          >
            <span
              className={[
                'grid h-[3.25rem] w-[3.25rem] shrink-0 place-items-center rounded-xl',
                messengerDocTileClasses(docMeta.tone, isMine),
              ].join(' ')}
            >
              <MessengerFileFormatEmoji tone={docMeta.tone} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span
                className={[
                  'line-clamp-2 text-[0.9375rem] font-semibold leading-snug tracking-tight',
                  isMine ? 'text-white' : 'text-[var(--text)]',
                ].join(' ')}
              >
                {name}
              </span>
              <span
                className={[
                  'mt-1.5 block text-[0.6875rem] font-bold uppercase tracking-wide',
                  isMine ? 'text-white/65' : 'text-[var(--text-secondary)]',
                ].join(' ')}
              >
                {subtitle}
              </span>
            </span>
          </button>
          <div
            className={[
              'flex flex-wrap items-center justify-end gap-2 border-t px-2.5 py-2',
              isMine ? 'border-white/10 bg-black/5' : 'border-stone-100/90 bg-stone-50/50',
            ].join(' ')}
          >
            <button
              type="button"
              disabled={!openHref}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (openHref) openDocument(openHref, name, mimeHint);
              }}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-40',
                isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
              ].join(' ')}
            >
              <LuExternalLink size={14} />
              Открыть
            </button>
            <button
              type="button"
              disabled={!saveHref}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!saveHref) return;
                void saveUrlToDevice(saveHref, name).catch(() =>
                  emitAppToast({ kind: 'error', message: 'Не удалось сохранить файл' }),
                );
              }}
              className={[
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold disabled:opacity-40',
                isMine ? 'bg-white/15 text-white' : 'bg-primary/10 text-primary',
              ].join(' ')}
            >
              <LuDownload size={14} />
              Сохранить
            </button>
          </div>
          {showCaption ? (
            <div
              className={[
                'border-t px-3 py-2 text-sm leading-relaxed',
                isMine ? 'border-white/10 text-white/95' : 'border-stone-100 text-[var(--text)]',
              ].join(' ')}
            >
              <MentionRichText text={caption} namesById={participantLabelById} isMine={isMine} />
            </div>
          ) : null}
        </div>
      );
    }

    // text (default) — в канале ИИ / от бота-помощника всегда Markdown-рендер
    const assistantText = String(message.content ?? payload.text ?? '');
    const useAssistantMarkdown =
      !isDeleted &&
      !isMine &&
      (assistantChannel ||
        systemBotAssistantMessage ||
        isAssistantBotMessage(payload, message.sender_id));
    if (useAssistantMarkdown) {
      return renderAssistantMessageContent(assistantText, { isMine });
    }
    return (
      <MentionRichText text={message.content} namesById={participantLabelById} isMine={isMine} />
    );
  };

  function formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    const fixed = i === 0 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 1);
    return `${fixed} ${units[i]}`;
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isDeleted && !isOptimistic) {
      setShowReactionBar(false);
      setShowActions(true);
    }
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressOrigin.current = null;
  };

  const isInteractiveMsgTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(
      target.closest(
        'button, a, input, textarea, select, [role="button"], [data-no-msg-menu], .msg-reaction-chip',
      ),
    );
  };

  const handlePointerDownCapture = (e: React.PointerEvent) => {
    if (e.button !== 0 || isDeleted || isOptimistic) return;
    if (isInteractiveMsgTarget(e.target)) return;
    longPressFiredRef.current = false;
    pointerMovedRef.current = false;
    longPressOrigin.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressFiredRef.current = true;
      suppressMenuUntilRef.current = Date.now() + 450;
      setShowActions(false);
      setMenuPos(null);
      setShowReactionBar(true);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(12);
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }, 480);
  };

  const handlePointerMoveCapture = (e: React.PointerEvent) => {
    if (longPressOrigin.current == null || longPressTimer.current == null) return;
    const o = longPressOrigin.current;
    if (Math.hypot(e.clientX - o.x, e.clientY - o.y) > 14) {
      pointerMovedRef.current = true;
      clearLongPressTimer();
    }
  };

  const handlePointerUpCapture = (e: React.PointerEvent) => {
    const longPressFired = longPressFiredRef.current;
    const moved = pointerMovedRef.current;
    const hadTimer = longPressTimer.current != null;
    clearLongPressTimer();

    if (e.button !== 0 || isDeleted || isOptimistic) return;
    if (longPressFired || moved) return;
    if (Date.now() < suppressMenuUntilRef.current) return;
    if (isInteractiveMsgTarget(e.target)) return;
    if (!hadTimer) return;

    // Короткий тап/клик — контекстное меню; удержание — реакции.
    setShowReactionBar(false);
    setShowActions(true);
  };

  useLayoutEffect(() => {
    if (!showActions) {
      setMenuPos(null);
      return;
    }
    const el = shellRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const viewTop = vv?.offsetTop ?? 0;
      const viewH = vv?.height ?? window.innerHeight;
      const viewBottom = viewTop + viewH;
      const menuWidth = Math.min(280, window.innerWidth - 16);
      const menuEl = menuRef.current;
      const menuH = Math.min(
        menuEl?.offsetHeight || 280,
        Math.min(viewH * 0.7, 420),
      );
      let left = isMine ? rect.right - menuWidth : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

      const gap = 6;
      const spaceAbove = rect.top - viewTop;
      const spaceBelow = viewBottom - rect.bottom;
      const preferAbove = spaceAbove >= spaceBelow && spaceAbove > 120;

      if (preferAbove) {
        // Anchor bottom edge just above the bubble; clamp so menu stays in view.
        const bottomEdge = Math.min(rect.top - gap, viewBottom - 8);
        const topEdge = Math.max(viewTop + 8, bottomEdge - menuH);
        setMenuPos({
          left,
          top: topEdge,
        });
      } else {
        let top = Math.max(viewTop + 8, rect.bottom + gap);
        if (top + menuH > viewBottom - 8) {
          top = Math.max(viewTop + 8, viewBottom - menuH - 8);
        }
        setMenuPos({ left, top });
      }
    };
    update();
    // Second pass after menu paints — real height for clamping.
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [showActions, isMine]);

  useEffect(() => {
    if (!showActions && !showReactionBar) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowActions(false);
        setShowReactionBar(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showActions, showReactionBar]);

  const closeActionsMenu = useCallback(() => {
    setShowActions(false);
    setMenuPos(null);
  }, []);

  const toggleReaction = (emoji: string, reactedByMe: boolean) => {
    if (reactedByMe) {
      void removeReaction(message.id, emoji);
    } else {
      void addReaction(message.id, emoji);
    }
  };

  const applyQuickReaction = useCallback(
    (emoji: string) => {
      const row = message.reactions.find((x) => x.emoji === emoji);
      if (row?.reacted_by_me) void removeReaction(message.id, emoji);
      else void addReaction(message.id, emoji);
      setShowReactionBar(false);
    },
    [message.reactions, message.id, addReaction, removeReaction],
  );

  if (isDeleted) {
    return (
      <div
        className={[
          'flex w-fit min-w-[80px] max-w-[75%] flex-col',
          isMine ? 'ml-auto items-end' : 'mr-auto items-start',
        ].join(' ')}
      >
        <div
          className={[
            'msg-bubble--deleted rounded-2xl px-4 py-2 text-sm',
            isMine ? 'rounded-br-sm bg-primary/20 text-white/80' : 'rounded-bl-sm bg-[var(--surface)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
      </div>
    );
  }

  const bubbleShapeClass = isVideoNoteLayout
    ? 'rounded-none'
    : systemBotAccessMessage
      ? 'rounded-2xl'
      : isMine
        ? 'rounded-tl-[22px] rounded-tr-[6px] rounded-br-[22px] rounded-bl-[22px]'
        : 'rounded-tl-[6px] rounded-tr-[22px] rounded-br-[22px] rounded-bl-[22px]';

  const bubbleClasses = isVideoNoteLayout
    ? ['tg-bubble relative bg-transparent p-0 shadow-none ring-0', bubbleShapeClass].join(' ')
    : [
        'tg-bubble relative px-3 py-2 sm:px-3.5 sm:py-2',
        bubbleShapeClass,
        systemBotAccessMessage
          ? 'bg-[var(--tg-bubble-in,var(--surface-elevated))] text-[var(--tg-bubble-in-text,var(--text))] shadow-[var(--tg-bubble-in-shadow)] ring-1 ring-[color:var(--tg-border)]'
          : isMine
            ? 'bg-primary text-white shadow-[var(--tg-bubble-out-shadow)]'
            : 'bg-[var(--tg-bubble-in,var(--surface-elevated))] text-[var(--tg-bubble-in-text,var(--text))] shadow-[var(--tg-bubble-in-shadow)]',
      ]
        .filter(Boolean)
        .join(' ');

  const metaRowClass = [
    'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-xs leading-none',
    isMine ? 'text-white/70' : 'text-[var(--text-muted)]',
  ].join(' ');

  /*
   * A11y статуса доставки (WCAG 2.1, SC 1.1.1 «Non-text Content» + SC 4.1.2 «Name, Role, Value»).
   *
   * Раньше статус дублировался двумя способами:
   *   1) сама иконка (`LuLoader` / `IoCheckmark` / `IoCheckmarkDone`) была `aria-hidden`;
   *   2) рядом с ней рендерился скрытый `aria-live="polite"` span с полным текстом.
   *
   * Проблема: на ленте из N своих сообщений это N живых регионов.
   * Некоторые screen-reader'ы (Orca, TalkBack) озвучивают все aria-live узлы при
   * первичном монтировании — пользователь получал «сообщение доставлено × 50» при
   * открытии чата. Это противоречит WCAG 2.1 Technique G192 (не злоупотреблять live).
   *
   * Решение:
   *   - Иконка получает `role="img" aria-label="..."` с текущим состоянием.
   *     SR читает её при фокусной навигации к метаданным сообщения, без спама.
   *   - Глобальные объявления «новое сообщение / typing / presence» делаются
   *     отдельными live-регионами уровня `ChatWindow` (см. `ChatWindow.tsx`),
   *     не per-message.
   *   - Retry-кнопка сама по себе интерактивна и имеет расширенный `aria-label`
   *     с полной фразой ошибки + действием.
   */
  const statusIconLabel = !isMine || isDeleted
    ? null
    : status === 'sending'
      ? 'Отправляется'
      : status === 'error'
        ? null // у «error» интерактивный элемент — label живёт на <button>
        : isReadByOther
          ? canViewReaders
            ? 'Прочитано. Нажмите, чтобы увидеть, кто прочитал'
            : 'Прочитано'
          : status === 'delivered'
            ? 'Доставлено'
            : 'Отправлено';

  const bubbleMeta = (
    <div className={metaRowClass}>
      {message.is_edited ? <span className="msg-edited">ред.</span> : null}
      <span className="tabular-nums messenger-bidi-text">
        {renderMessengerPlainText(formattedTime, 'meta-time')}
      </span>
      {isMine ? (
        <>
          {status === 'sending' ? (
            <LuLoader
              className="h-3.5 w-3.5 shrink-0 animate-spin text-white/85"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          ) : status === 'error' ? (
            <button
              type="button"
              className="tg-msg-status-dot tg-msg-status-dot--error"
              aria-label="Сообщение не доставлено. Нажмите, чтобы повторить отправку."
              title="Повторить отправку"
              onClick={() => {
                void retrySendMessage(String(message.conversation_id), String(message.id));
              }}
            >
              <LuX className="h-2 w-2" strokeWidth={3} aria-hidden focusable={false} />
            </button>
          ) : isReadByOther ? (
            canViewReaders ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center rounded-sm text-sky-200 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                aria-label={statusIconLabel ?? 'Прочитано'}
                title="Кто прочитал"
                onClick={(e) => {
                  e.stopPropagation();
                  openReadersSheet();
                }}
              >
                <IoCheckmarkDone className="h-3.5 w-3.5 shrink-0" aria-hidden focusable={false} />
              </button>
            ) : (
              <IoCheckmarkDone
                className="h-3.5 w-3.5 shrink-0 text-sky-200"
                role="img"
                aria-label={statusIconLabel ?? undefined}
                focusable={false}
              />
            )
          ) : status === 'delivered' ? (
            canViewReaders ? (
              <button
                type="button"
                className="inline-flex shrink-0 items-center rounded-sm text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                aria-label="Доставлено. Нажмите, чтобы увидеть, кто прочитал"
                title="Кто прочитал"
                onClick={(e) => {
                  e.stopPropagation();
                  openReadersSheet();
                }}
              >
                <IoCheckmarkDone className="h-3.5 w-3.5 shrink-0" aria-hidden focusable={false} />
              </button>
            ) : (
              <IoCheckmarkDone
                className="h-3.5 w-3.5 shrink-0 text-white/70"
                role="img"
                aria-label={statusIconLabel ?? undefined}
                focusable={false}
              />
            )
          ) : canViewReaders ? (
            <button
              type="button"
              className="inline-flex shrink-0 items-center rounded-sm text-white/70 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
              aria-label="Отправлено. Нажмите, чтобы увидеть, кто прочитал"
              title="Кто прочитал"
              onClick={(e) => {
                e.stopPropagation();
                openReadersSheet();
              }}
            >
              <IoCheckmark className="h-3.5 w-3.5 shrink-0" aria-hidden focusable={false} />
            </button>
          ) : (
            <IoCheckmark
              className="h-3.5 w-3.5 shrink-0 text-white/70"
              role="img"
              aria-label={statusIconLabel ?? undefined}
              focusable={false}
            />
          )}
        </>
      ) : null}
    </div>
  );

  const shellClassName = [
    'msg-bubble-shell message-bubble relative flex flex-col',
    systemBotAccessMessage
      ? 'mx-auto w-full max-w-[min(100%,26rem)] min-w-0 items-center'
      : isVideoNoteLayout
        ? ['w-fit max-w-[min(85vw,280px)]', isMine ? 'ml-auto items-end' : 'mr-auto items-start'].join(' ')
        : ['w-fit min-w-[80px] max-w-[75%]', isMine ? 'ml-auto items-end' : 'mr-auto items-start'].join(' '),
    !isGroupedPrev ? 'group-start' : '',
    isMine ? 'outgoing' : 'incoming',
    isVideoNoteLayout ? 'msg-bubble-shell--videonote' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
    <div
      ref={shellRef}
      className={shellClassName}
      onContextMenu={handleContextMenu}
      onPointerDownCapture={handlePointerDownCapture}
      onPointerMoveCapture={handlePointerMoveCapture}
      onPointerUpCapture={handlePointerUpCapture}
      onPointerCancelCapture={() => {
        clearLongPressTimer();
        pointerMovedRef.current = true;
      }}
    >
      <div className="relative">
        {showReactionBar ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className="msg-reaction-bar-overlay"
              onClick={() => setShowReactionBar(false)}
            />
            <div
              role="toolbar"
              aria-label="Быстрые реакции"
              className={['msg-reaction-floating', isMine ? 'msg-reaction-floating--mine' : ''].join(' ')}
              onClick={(ev) => ev.stopPropagation()}
            >
              {QUICK_REACTION_STRIP.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="msg-reaction-floating__emoji"
                  title={emoji}
                  onClick={() => applyQuickReaction(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <motion.div
          className={['absolute top-1/2 z-0 -translate-y-1/2', isMine ? 'right-2' : 'left-2'].join(' ')}
          style={{ opacity: replyOpacity, scale: replyScale }}
          aria-hidden
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <LuReply size={18} />
          </div>
        </motion.div>

        <motion.div
          className={bubbleClasses}
          drag={systemBotAccessMessage ? false : 'x'}
          dragConstraints={systemBotAccessMessage ? undefined : { left: 0, right: 0 }}
          dragElastic={systemBotAccessMessage ? undefined : 0.2}
          style={{ x }}
          onDragStart={() => {
            pointerMovedRef.current = true;
            clearLongPressTimer();
          }}
          onDragEnd={(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (systemBotAccessMessage) return;
            const dx = info.offset.x;
            const towardCenter = isMine ? dx < -52 : dx > 52;
            if (towardCenter) {
              setReplyingTo(message);
              if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(45);
              }
            }
            clearLongPressTimer();
            animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
          }}
        >
        {/* Канал «Заявки» / «ИИ помощник»: шапка как системный бот */}
        {systemBotAccessMessage && !isGroupedPrev ? (
          <div className="sender-name mb-3 flex w-full items-center gap-2.5 px-0.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/15"
              aria-hidden
            >
              <LuBot className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0 text-left">
              <div className="text-sm font-bold leading-tight text-[var(--text)]">Заявки</div>
              <div className="text-[11px] font-medium leading-tight text-[var(--text-secondary)]">Системные уведомления</div>
            </div>
          </div>
        ) : systemBotAssistantMessage && !isGroupedPrev ? (
          <div className="sender-name mb-3 flex w-full items-center gap-2.5 px-0.5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-primary ring-1 ring-primary/15"
              aria-hidden
            >
              <LuBot className="h-5 w-5" strokeWidth={2} />
            </span>
            <div className="min-w-0 text-left">
              <div className="text-sm font-bold leading-tight text-[var(--text)]">ИИ помощник</div>
              <div className="text-[11px] font-medium leading-tight text-[var(--text-secondary)]">Ответы по программе церкви</div>
            </div>
          </div>
        ) : !isMine && !isGroupedPrev && message.sender_name ? (
          <div className="sender-name mb-1.5 px-1 text-xs font-semibold text-[var(--text-secondary)]">{message.sender_name}</div>
        ) : null}

        {/* Reply preview (tap to jump) */}
        {forwardedFromLabel ? (
          <div
            className={[
              'mb-1 text-[12px] font-semibold leading-tight',
              isMine ? 'text-sky-100/90' : 'text-primary',
            ].join(' ')}
          >
            Переслано от {forwardedFromLabel}
          </div>
        ) : null}

        {message.reply_preview && (
          <button
            type="button"
            className={`msg-reply-preview message-quote ${isMine ? 'msg-reply-preview--out' : 'msg-reply-preview--in'} ${isVideoNoteLayout ? 'mb-2' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              const id = String(message.reply_preview?.id ?? '').trim();
              if (id && /^\d+$/.test(id)) onJumpToMessage?.(id);
            }}
            aria-label="Перейти к сообщению"
            title="Перейти к сообщению"
          >
            <div className="msg-reply-author">
              <span className="quote-author">
              {message.reply_preview.sender_name || 'Удалённый пользователь'}
              </span>
            </div>
            <div className="msg-reply-text messenger-bidi-text">
              {message.reply_preview.is_deleted
                ? 'Сообщение удалено'
                : renderMessengerPlainText(String(message.reply_preview.content ?? ''), 'reply')}
            </div>
          </button>
        )}

        {isVideoNoteLayout ? (
          <>
            <VideoNoteAttachment
              videoSrc={videoNoteMedia?.primary ?? null}
              videoFallbackSrc={videoNoteMedia?.fallbackSrc ?? null}
              isMine={isMine}
              durationHintSec={videoNoteDurationSec}
              metaOverlay={<div className="msg-videonote-bubble-meta">{bubbleMeta}</div>}
            />
            {videoNoteCaption ? (
              <div
                className={[
                  'msg-videonote-caption mt-2 max-w-[min(85vw,280px)] text-sm leading-relaxed',
                  'text-[var(--text)]',
                ].join(' ')}
              >
                <MentionRichText text={videoNoteCaption} namesById={participantLabelById} isMine={isMine} />
              </div>
            ) : null}
            {message.is_pinned ? (
              <div
                className={['mt-1 text-xs font-bold uppercase tracking-wide', isMine ? 'text-primary/80' : 'text-amber-600'].join(
                  ' ',
                )}
              >
                📌 Закреплено
              </div>
            ) : null}
          </>
        ) : useInlineTextMeta ? (
          <div className="flex min-w-0 flex-row flex-wrap items-end gap-x-2 gap-y-0.5">
            <div
              className="msg-content messenger-bidi-text min-w-0 flex-1"
              onCopy={handleMessengerTextCopy}
            >
              {renderContent()}
            </div>
            <div className="ml-auto">{bubbleMeta}</div>
          </div>
        ) : (
          <>
            <div className="msg-content messenger-bidi-text" onCopy={handleMessengerTextCopy}>
              {renderContent()}
            </div>
            {message.is_pinned ? (
              <div
                className={['mt-1 text-xs font-bold uppercase tracking-wide', isMine ? 'text-white/60' : 'text-amber-600'].join(' ')}
              >
                📌 Закреплено
              </div>
            ) : null}
            <div className="mt-1 flex w-full items-center justify-end">{bubbleMeta}</div>
          </>
        )}
        </motion.div>
      </div>

      {/* Reactions Display */}
      {message.reactions.length > 0 && (
        <div className={`msg-reactions ${isMine ? 'msg-reactions--mine' : 'msg-reactions--in'}`}>
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={`msg-reaction-chip ${r.reacted_by_me ? 'msg-reaction-chip--active' : ''}`}
              onClick={() => toggleReaction(r.emoji, r.reacted_by_me)}
            >
              <span>{r.emoji}</span>
              <span className="msg-reaction-count">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Actions Popup — portal, чтобы не обрезалось списком сообщений */}
      {showActions && typeof document !== 'undefined'
        ? createPortal(
            <>
              <div
                className="msg-actions-overlay"
                onClick={() => {
                  closeActionsMenu();
                  setShowReactionBar(false);
                }}
              />
              <div
                ref={menuRef}
                className={`msg-actions msg-actions--portal ${isMine ? 'msg-actions--mine' : ''}`}
                style={
                  menuPos
                    ? {
                        position: 'fixed',
                        left: menuPos.left,
                        top: menuPos.top,
                        bottom: 'auto',
                        right: 'auto',
                        margin: 0,
                      }
                    : { position: 'fixed', visibility: 'hidden', left: 0, top: 0 }
                }
                role="menu"
                aria-label="Действия с сообщением"
              >
                {!systemBotAccessMessage ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setReplyTo(message);
                      closeActionsMenu();
                    }}
                  >
                    <span>↩️</span> Ответить
                  </button>
                ) : null}
                {canEditOwnMessage ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setEditing(message);
                      closeActionsMenu();
                    }}
                  >
                    <span>✏️</span> Редактировать
                  </button>
                ) : null}
                {canDeleteMessage ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="msg-actions__danger"
                    onClick={() => {
                      void deleteMessage(message.id);
                      closeActionsMenu();
                    }}
                  >
                    <span>🗑</span> Удалить
                  </button>
                ) : null}
                {canForwardMessage ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      openForwardSheet();
                    }}
                  >
                    <span>↪️</span> Переслать
                  </button>
                ) : null}
                {payloadType === 'text' && String(message.content ?? payload.text ?? '').trim() ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const raw = String(message.content ?? payload.text ?? '');
                      const forClipboard =
                        systemBotAssistantMessage || assistantChannel
                          ? assistantMarkdownToPlainText(raw)
                          : messengerTextForCopy(raw);
                      void navigator.clipboard
                        .writeText(forClipboard)
                        .then(() => emitAppToast('Текст скопирован', 'success'))
                        .catch(() => emitAppToast('Не удалось скопировать', 'error'));
                      closeActionsMenu();
                    }}
                  >
                    <span>📋</span> Копировать
                  </button>
                ) : null}
                {canViewReaders ? (
                  <button type="button" role="menuitem" onClick={() => openReadersSheet()}>
                    <span>✓</span> Кто прочитал
                  </button>
                ) : null}
                {canPinMessages && !isOptimistic && /^\d+$/.test(String(message.id)) ? (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void onPinToggle?.(String(message.id), !message.is_pinned);
                      closeActionsMenu();
                    }}
                  >
                    <span>{message.is_pinned ? '📍' : '📌'}</span>{' '}
                    {message.is_pinned ? 'Открепить' : 'Закрепить'}
                  </button>
                ) : null}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeActionsMenu();
                    setShowReactionBar(true);
                  }}
                >
                  <span>😀</span> Реакция
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>

    <DocumentViewerModal
      open={documentViewer != null}
      fileUrl={documentViewer?.url ?? null}
      fileName={documentViewer?.name ?? 'Документ'}
      fileMime={documentViewer?.mime}
      onClose={() => setDocumentViewer(null)}
    />
    {canViewReaders ? (
      <MessageReadersSheet
        open={showReadersSheet}
        onClose={() => setShowReadersSheet(false)}
        messageId={String(message.id)}
      />
    ) : null}
    {canForwardMessage ? (
      <ForwardMessageSheet
        open={showForwardSheet}
        onClose={() => setShowForwardSheet(false)}
        messageId={String(message.id)}
        sourceConversationId={String(message.conversation_id)}
      />
    ) : null}
    </>
  );
}

export const MessageBubble = memo(MessageBubbleInner);
