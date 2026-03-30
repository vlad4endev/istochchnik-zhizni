import { useState, useRef, useMemo } from 'react';
import { useChatStore } from '../chatStore';
import type { MessageWithSender } from '../api/messengerApi';

interface MessageBubbleProps {
  message: MessageWithSender;
  isGroupedPrev: boolean;
  isGroupedNext: boolean;
}

export function MessageBubble({ message, isGroupedPrev, isGroupedNext }: MessageBubbleProps) {
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditing = useChatStore((s) => s.setEditing);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const addReaction = useChatStore((s) => s.addReaction);
  const currentMemberId = useChatStore((s) => s.currentMemberId);
  const [showActions, setShowActions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOptimistic = message.id.startsWith('temp-');
  const isMine = isOptimistic || (currentMemberId != null && message.sender_id === currentMemberId);
  const isDeleted = message.is_deleted;

  const formattedTime = useMemo(() => {
    const d = new Date(message.created_at);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }, [message.created_at]);

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

  const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  if (isDeleted) {
    return (
      <div className={`tg-bubble-wrap ${isMine ? 'tg-bubble-wrap--out' : 'tg-bubble-wrap--in'}`}>
        <div className="tg-bubble msg-bubble--deleted">
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
      </div>
    );
  }

  const bubbleClasses = [
    'tg-bubble',
    isMine ? 'tg-bubble--out' : 'tg-bubble--in',
    isOptimistic ? 'msg-bubble--sending' : '',
    isGroupedPrev ? (isMine ? 'tg-bubble--out.tg-bubble--grouped-prev' : 'tg-bubble--in.tg-bubble--grouped-prev') : '',
    isGroupedNext ? (isMine ? 'tg-bubble--out.tg-bubble--grouped-next' : 'tg-bubble--in.tg-bubble--grouped-next') : '',
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
        {/* Tail (only if first in group) */}
        {!isGroupedPrev && (
          <div className={`tg-bubble-tail ${isMine ? 'tg-bubble-tail--out' : 'tg-bubble-tail--in'}`}>
            <svg width="9" height="12" viewBox="0 0 9 12" fill="currentColor">
              {isMine ? (
                <path d="M0 0C3 0 9 0 9 0V12C9 12 1 5 0 0Z" />
              ) : (
                <path d="M9 0C6 0 0 0 0 0V12C0 12 8 5 9 0Z" />
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
        <div className="msg-content">{message.content}</div>

        {/* Meta */}
        <div className="tg-bubble-meta">
          {message.is_edited && <span className="msg-edited">ред.</span>}
          <span>{formattedTime}</span>
          {isMine && !isOptimistic && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
              <polyline points="22 6 11 17 6 12" style={{ marginLeft: '-8px' }} />
            </svg>
          )}
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
              onClick={() => void addReaction(message.id, r.emoji)}
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
                      void addReaction(message.id, emoji);
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

      <style>{bubbleExtraStyles}</style>
    </div>
  );
}

const bubbleExtraStyles = `
  .tg-bubble-tail {
    position: absolute;
    bottom: 0;
    width: 9px;
    height: 12px;
    z-index: -1;
  }
  .tg-bubble-tail--out {
    right: -7px;
    color: var(--tg-bubble-out);
  }
  .tg-bubble-tail--in {
    left: -7px;
    color: var(--tg-bubble-in);
  }
  
  .tg-bubble--grouped-prev {
    margin-top: 2px !important;
  }
  
  .msg-reply-preview {
    border-left: 2px solid var(--tg-primary);
    padding-left: 8px;
    margin-bottom: 4px;
    background: rgba(0,0,0,0.03);
    border-radius: 2px 4px 4px 2px;
  }
  
  .tg-bubble--out .msg-reply-preview {
    border-left-color: white;
    background: rgba(255,255,255,0.1);
  }
`;
