import { useState, useRef, useMemo, useEffect } from 'react';
import { useChatStore } from '../chatStore';
import type { MessageWithSender } from '../api/messengerApi';
import { IoCheckmark, IoCheckmarkDone } from 'react-icons/io5';

interface MessageBubbleProps {
  message: MessageWithSender;
  isGroupedPrev: boolean;
  isGroupedNext: boolean;
}

export function MessageBubble({ message, isGroupedPrev, isGroupedNext }: MessageBubbleProps) {
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const readCursorsByConv = useChatStore((s) => s.readCursorsByConv);
  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOptimistic = message.id.startsWith('temp-');
  const isMine = isOptimistic || (currentMemberId != null && message.sender_id === currentMemberId);
  const isDeleted = message.is_deleted;
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
          <div className="rounded-2xl border border-white/10 bg-white/8 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.10)] backdrop-blur-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold tracking-wide text-white/75">
                  Молитвенная нужда
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-5 text-white/95">
                  {text || '—'}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePrayClick}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-[13px] font-semibold text-white/95 transition hover:bg-white/14 active:scale-[0.99]"
              >
                <span aria-hidden>🙏</span>
                <span>Я молюсь</span>
                <span className="rounded-full bg-white/12 px-2 py-0.5 text-[12px] font-bold">
                  {Number.isFinite(count) ? count : 0}
                </span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    // text (default)
    return <>{message.content}</>;
  };

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
      <div className={`tg-bubble-wrap ${isMine ? 'tg-bubble-wrap--out' : 'tg-bubble-wrap--in'}`}>
        <div className={`tg-bubble msg-bubble--deleted ${isMine ? 'tg-bubble--out' : 'tg-bubble--in'}`}>
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
      </div>
    );
  }

  const bubbleClasses = [
    'tg-bubble',
    isMine ? 'tg-bubble--out' : 'tg-bubble--in',
    isOptimistic ? 'msg-bubble--sending' : '',
    isGroupedPrev ? 'tg-bubble--grouped-prev' : '',
    isGroupedNext ? 'tg-bubble--grouped-next' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`tg-bubble-wrap ${isMine ? 'tg-bubble-wrap--out' : 'tg-bubble-wrap--in'}`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ 
        marginTop: isGroupedPrev ? '2px' : '8px',
        marginBottom: isGroupedNext ? '0' : '4px'
      }}
    >
      <div className={bubbleClasses}>
        {/* Tail (only if first message in group / single message) */}
        {!isGroupedPrev && (
          <div className={`tg-bubble-tail ${isMine ? 'tg-bubble-tail--out' : 'tg-bubble-tail--in'}`}>
            <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
              {isMine ? (
                <path d="M0 14C3 14 10 14 10 14V0C10 0 1 7 0 14Z" />
              ) : (
                <path d="M10 14C7 14 0 14 0 14V0C0 0 9 7 10 14Z" />
              )}
            </svg>
          </div>
        )}

        {/* Sender name (only if first message in group and not mine) */}
        {!isMine && !isGroupedPrev && message.sender_name && (
          <div className="tg-bubble-sender">{message.sender_name}</div>
        )}

        {/* Reply preview */}
        {message.reply_preview && (
          <div className="msg-reply-preview">
            <div className="msg-reply-author">
              {message.reply_preview.sender_name || 'Удалённый пользователь'}
            </div>
            <div className="msg-reply-text">
              {message.reply_preview.is_deleted ? 'Сообщение удалено' : message.reply_preview.content}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="msg-content">{renderContent()}</div>

        {/* Meta */}
        <div className="tg-bubble-meta">
          {message.is_edited && <span className="msg-edited">ред.</span>}
          <span>{formattedTime}</span>
          {isMine && !isOptimistic ? (
            isReadByOther ? (
              <IoCheckmarkDone className="h-4 w-4 text-blue-500" aria-label="Прочитано" />
            ) : (
              <IoCheckmark className="h-4 w-4 text-gray-400" aria-label="Отправлено" />
            )
          ) : null}
          {isOptimistic && <span>⏳</span>}
        </div>
      </div>

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
  );
}
