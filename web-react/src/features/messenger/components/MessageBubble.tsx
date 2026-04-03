import { useState, useRef, useMemo, useEffect } from 'react';
import { useChatStore } from '../chatStore';
import type { MessageWithSender } from '../api/messengerApi';
import { IoCheckmark, IoCheckmarkDone } from 'react-icons/io5';
import { LuDownload, LuFileText } from 'react-icons/lu';
import { IoAlertCircleOutline, IoTimeOutline } from 'react-icons/io5';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { LuReply } from 'react-icons/lu';

interface MessageBubbleProps {
  message: MessageWithSender;
  isGroupedPrev: boolean;
  isGroupedNext: boolean;
  onJumpToMessage?: (messageId: string) => void;
}

export function MessageBubble({ message, isGroupedPrev, isGroupedNext, onJumpToMessage }: MessageBubbleProps) {
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const readCursorsByConv = useChatStore((s) => s.readCursorsByConv);
  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const retrySendMessage = useChatStore((s) => s.retrySendMessage);

  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [-90, -50, 0], [1, 0.9, 0]);
  const replyScale = useTransform(x, [-90, -50, 0], [1, 0.98, 0.9]);

  const isOptimistic = message.id.startsWith('temp-');
  const isMine = isOptimistic || (currentMemberId != null && message.sender_id === currentMemberId);
  const isDeleted = message.is_deleted;
  const status = message.status ?? (isOptimistic ? 'sending' : 'sent');
  const convReadCursors = readCursorsByConv[String(message.conversation_id)] || {};

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

  const formattedTime = useMemo(() => {
    const d = new Date(message.created_at);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, [message.created_at]);

  const payloadType = message.payload_type ?? 'text';
  const payload = (message.payload ?? {}) as Record<string, unknown>;

  const handlePrayClick = () => {
    // Этап 2: заглушка для интерактивной карточки
    // В Этапе 3/следующих этапах подключим API + WS синк.
    // eslint-disable-next-line no-console
    console.log('[messenger] pray click', { messageId: message.id });
  };

  const renderContent = () => {
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
              isMine ? 'border-white/10 bg-white/10 backdrop-blur-sm' : 'border-gray-100 bg-gray-50',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={['text-[12px] font-extrabold tracking-wide', isMine ? 'text-white/75' : 'text-gray-500'].join(' ')}>
                  Молитвенная нужда
                </div>
                <div className={['mt-1 whitespace-pre-wrap break-words text-[14px] leading-5', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>
                  {text || '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrayClick}
                className={[
                  'inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors duration-200 active:scale-[0.99]',
                  isMine
                    ? 'bg-white/10 text-white/95 hover:bg-white/15'
                    : 'bg-primary/10 text-primary hover:bg-primary/15',
                ].join(' ')}
              >
                <span aria-hidden>🙏</span>
                <span>Я молюсь</span>
                <span className={['rounded-full px-2 py-0.5 text-[12px] font-bold', isMine ? 'bg-white/15' : 'bg-primary/15'].join(' ')}>
                  {Number.isFinite(count) ? count : 0}
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (payloadType === 'image') {
      const rawUrl = String(payload.url ?? '').trim();
      const src = resolvePublicUrl(rawUrl) ?? rawUrl;
      return src ? (
        <button
          type="button"
          onClick={() => setLightboxSrc(src)}
          className="block w-full max-w-[250px] overflow-hidden rounded-lg bg-black/5"
          aria-label="Открыть изображение"
        >
          <img src={src} alt="" className="h-48 w-full object-cover" loading="lazy" />
        </button>
      ) : (
        <span>Изображение недоступно</span>
      );
    }

    if (payloadType === 'file') {
      const rawUrl = String(payload.url ?? '').trim();
      const href = resolvePublicUrl(rawUrl) ?? rawUrl;
      const name = String(payload.name ?? payload.filename ?? message.content ?? 'Файл').trim() || 'Файл';
      const sizeRaw = Number(payload.size ?? 0);
      const sizeLabel = Number.isFinite(sizeRaw) && sizeRaw > 0 ? formatBytes(sizeRaw) : null;
      return (
        <a
          href={href || undefined}
          target="_blank"
          rel="noreferrer"
          className={[
            'flex max-w-[20rem] items-center justify-between gap-3 rounded-2xl px-3 py-2 ring-1 transition-colors duration-200',
            isMine
              ? 'bg-white/10 ring-white/10 hover:bg-white/15'
              : 'bg-gray-50 ring-gray-100 hover:bg-gray-100',
          ].join(' ')}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className={['grid h-10 w-10 place-items-center rounded-xl', isMine ? 'bg-white/12 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-100'].join(' ')}>
              <LuFileText size={18} />
            </span>
            <span className="min-w-0">
              <span className={['block truncate text-[14px] font-semibold', isMine ? 'text-white/95' : 'text-gray-900'].join(' ')}>{name}</span>
              <span className={['mt-0.5 block text-[11px] font-semibold', isMine ? 'text-white/70' : 'text-gray-500'].join(' ')}>
                {sizeLabel ?? 'Файл'}
              </span>
            </span>
          </span>
          <span className={['inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[11px] font-extrabold', isMine ? 'bg-white/12 text-white/90' : 'bg-primary/10 text-primary'].join(' ')}>
            <LuDownload size={14} />
            Скачать
          </span>
        </a>
      );
    }

    // text (default)
    return <>{message.content}</>;
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
      setShowActions(!showActions);
    }
  };

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      if (!isDeleted && !isOptimistic) {
        setShowActions(true);
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    if (!showActions) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowActions(false);
        setShowReactions(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showActions]);

  const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏', '😡', '😍', '🔥', '💯', '✨', '👏'];

  const toggleReaction = (emoji: string, reactedByMe: boolean) => {
    if (reactedByMe) {
      void removeReaction(message.id, emoji);
    } else {
      void addReaction(message.id, emoji);
    }
  };

  if (isDeleted) {
    return (
      <div
        className={[
          'flex w-fit max-w-[min(88%,20.5rem)] flex-col sm:max-w-[min(84%,24rem)]',
          isMine ? 'ml-auto items-end' : 'mr-auto items-start',
        ].join(' ')}
      >
        <div
          className={[
            'msg-bubble--deleted rounded-2xl px-4 py-2 text-sm',
            isMine ? 'rounded-br-sm bg-primary/20 text-white/80' : 'rounded-bl-sm bg-gray-100 text-gray-500',
          ].join(' ')}
        >
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
      </div>
    );
  }

  const bubbleClasses = [
    'relative rounded-2xl px-3.5 py-2 shadow-sm sm:px-4 sm:py-2.5',
    isMine
      ? 'rounded-br-sm bg-primary text-white'
      : 'rounded-bl-sm border border-gray-100 bg-white text-gray-900',
    isOptimistic ? 'msg-bubble--sending' : '',
    isGroupedPrev ? (isMine ? 'rounded-br-2xl' : 'rounded-bl-2xl') : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
    <div
      className={[
        'flex w-fit max-w-[min(88%,20.5rem)] flex-col sm:max-w-[min(84%,24rem)]',
        isMine ? 'ml-auto items-end' : 'mr-auto items-start',
      ].join(' ')}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ 
        marginTop: isGroupedPrev ? '2px' : '8px',
        marginBottom: isGroupedNext ? '0' : '4px'
      }}
    >
      <div className="relative">
        <motion.div
          className="absolute right-2 top-1/2 -translate-y-1/2"
          style={{ opacity: replyOpacity, scale: replyScale }}
          aria-hidden
        >
          <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
            <LuReply size={18} />
          </div>
        </motion.div>

        <motion.div
          className={bubbleClasses}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          style={{ x }}
          onDragEnd={(_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            const dx = info.offset.x;
            if (dx < -50) {
              setReplyingTo(message);
              if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                navigator.vibrate(50);
              }
            }
            animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
          }}
        >
        {/* Sender name (only if first message in group and not mine) */}
        {!isMine && !isGroupedPrev && message.sender_name && (
          <div className="mb-1.5 px-1 text-xs font-semibold text-gray-500">{message.sender_name}</div>
        )}

        {/* Reply preview (tap to jump) */}
        {message.reply_preview && (
          <button
            type="button"
            className="msg-reply-preview"
            onClick={(e) => {
              e.stopPropagation();
              const id = String(message.reply_preview?.id ?? '').trim();
              if (id && /^\d+$/.test(id)) onJumpToMessage?.(id);
            }}
            aria-label="Перейти к сообщению"
            title="Перейти к сообщению"
          >
            <div className="msg-reply-author">
              {message.reply_preview.sender_name || 'Удалённый пользователь'}
            </div>
            <div className="msg-reply-text">
              {message.reply_preview.is_deleted ? 'Сообщение удалено' : message.reply_preview.content}
            </div>
          </button>
        )}

        {/* Content */}
        <div className="msg-content whitespace-pre-wrap break-words text-[14px] leading-relaxed sm:text-[15px]">{renderContent()}</div>

        {/* Meta */}
        <div className={['mt-1 flex items-center justify-end gap-1 text-[11px]', isMine ? 'text-white/70' : 'text-gray-400'].join(' ')}>
          {message.is_edited && <span className="msg-edited">ред.</span>}
          <span>{formattedTime}</span>
          {isMine ? (
            status === 'sending' ? (
              <IoTimeOutline className="h-3.5 w-3.5 text-white/70" aria-label="Отправляется" />
            ) : status === 'error' ? (
              <IoAlertCircleOutline className="h-4 w-4 text-red-500" aria-label="Ошибка отправки" />
            ) : (
              <>
                {isReadByOther ? (
                  <IoCheckmarkDone className="h-3.5 w-3.5 text-sky-200" aria-label="Прочитано" />
                ) : (
                  <IoCheckmark className="h-3.5 w-3.5 text-white/70" aria-label="Отправлено" />
                )}
              </>
            )
          ) : null}
        </div>
        </motion.div>
      </div>

      {isMine && status === 'error' ? (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => void retrySendMessage(String(message.conversation_id), String(message.id))}
            className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-[11px] font-extrabold text-red-700 ring-1 ring-red-200/70 transition-colors duration-200 hover:bg-red-100"
          >
            Повторить отправку
          </button>
        </div>
      ) : null}

      {/* Reactions Display */}
      {message.reactions.length > 0 && (
        <div className={`msg-reactions ${isMine ? 'msg-reactions--mine' : ''}`}>
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

      {/* Actions Popup (Context Menu) */}
      {showActions && (
        <>
          <div className="msg-actions-overlay" onClick={() => setShowActions(false)} />
          <div className={`msg-actions ${isMine ? 'msg-actions--mine' : ''}`}>
            <button type="button" onClick={() => { setReplyTo(message); setShowActions(false); }}>
              <span>↩️</span> Ответить
            </button>
            {isMine && (
              <button type="button" onClick={() => { setEditing(message); setShowActions(false); }}>
                <span>✏️</span> Редактировать
              </button>
            )}
            {isMine && (
              <button type="button" className="msg-actions__danger" onClick={() => { void deleteMessage(message.id); setShowActions(false); }}>
                <span>🗑</span> Удалить
              </button>
            )}
            <button type="button" onClick={() => { setShowReactions(!showReactions); }}>
              <span>😀</span> Реакция
            </button>
            {showReactions && (
              <div className="msg-quick-reactions">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="msg-quick-reaction"
                    onClick={() => {
                      const row = message.reactions.find((x) => x.emoji === emoji);
                      if (row?.reacted_by_me) {
                        void removeReaction(message.id, emoji);
                      } else {
                        void addReaction(message.id, emoji);
                      }
                      setShowActions(false);
                      setShowReactions(false);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {lightboxSrc ? (
      <div
        className="fixed inset-0 z-[5000] bg-black/80 p-4"
        onClick={() => setLightboxSrc(null)}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto flex h-full max-w-2xl items-center justify-center">
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    ) : null}
    </>
  );
}
