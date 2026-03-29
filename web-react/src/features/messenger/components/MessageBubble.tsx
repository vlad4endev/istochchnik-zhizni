import { useState, useRef, useMemo } from 'react';
import { useChatStore } from '../chatStore';
import type { MessageWithSender } from '../api/messengerApi';

interface MessageBubbleProps {
  message: MessageWithSender;
}

export function MessageBubble({ message }: MessageBubbleProps) {
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
      <div className={`msg-row ${isMine ? 'msg-row--mine' : ''}`}>
        <div className="msg-bubble msg-bubble--deleted">
          <span className="msg-deleted-text">Сообщение удалено</span>
        </div>
        <style>{bubbleStyles}</style>
      </div>
    );
  }

  return (
    <div
      className={`msg-row ${isMine ? 'msg-row--mine' : ''}`}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div className={`msg-bubble ${isMine ? 'msg-bubble--mine' : 'msg-bubble--theirs'} ${isOptimistic ? 'msg-bubble--sending' : ''}`}>
        {/* Sender name (for group chats) */}
        {!isMine && message.sender_name && (
          <span className="msg-sender">{message.sender_name}</span>
        )}

        {/* Reply preview */}
        {message.reply_preview && (
          <div className="msg-reply-preview">
            <span className="msg-reply-author">
              {message.reply_preview.sender_name || 'Удалённый пользователь'}
            </span>
            <span className="msg-reply-text">
              {message.reply_preview.is_deleted ? 'Сообщение удалено' : message.reply_preview.content}
            </span>
          </div>
        )}

        {/* Content */}
        <span className="msg-content">{message.content}</span>

        {/* Meta: time + edited */}
        <span className="msg-meta">
          {message.is_edited && <span className="msg-edited">ред.</span>}
          <span className="msg-time">{formattedTime}</span>
          {isOptimistic && <span className="msg-sending">⏳</span>}
        </span>
      </div>

      {/* Reactions */}
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

      {/* Actions popup */}
      {showActions && (
        <>
          <div className="msg-actions-overlay" onClick={() => setShowActions(false)} />
          <div className={`msg-actions ${isMine ? 'msg-actions--mine' : ''}`}>
            <button type="button" onClick={() => { setReplyTo(message); setShowActions(false); }}>
              ↩️ Ответить
            </button>
            {isMine && (
              <button type="button" onClick={() => { setEditing(message); setShowActions(false); }}>
                ✏️ Редактировать
              </button>
            )}
            {isMine && (
              <button type="button" className="msg-actions__danger" onClick={() => { void deleteMessage(message.id); setShowActions(false); }}>
                🗑 Удалить
              </button>
            )}
            <button type="button" onClick={() => { setShowReactions(!showReactions); }}>
              😀 Реакция
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

      <style>{bubbleStyles}</style>
    </div>
  );
}

const bubbleStyles = `
  .msg-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    position: relative;
    padding: 2px 0;
    max-width: 85%;
  }
  .msg-row--mine {
    align-self: flex-end;
    align-items: flex-end;
  }

  .msg-bubble {
    position: relative;
    padding: 8px 12px 6px;
    border-radius: 16px;
    max-width: 100%;
    word-wrap: break-word;
    word-break: break-word;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    transition: opacity 0.2s;
  }

  .msg-bubble--mine {
    background: var(--primary);
    color: white;
    border-bottom-right-radius: 4px;
  }

  .msg-bubble--theirs {
    background: var(--surface-elevated);
    color: var(--text);
    border-bottom-left-radius: 4px;
    border: 1px solid rgba(28, 25, 23, 0.06);
  }

  .msg-bubble--sending {
    opacity: 0.7;
  }

  .msg-bubble--deleted {
    background: transparent;
    border: 1px dashed rgba(28, 25, 23, 0.15);
    padding: 6px 12px;
  }
  .msg-deleted-text {
    font-size: 0.8125rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .msg-sender {
    display: block;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--primary);
    margin-bottom: 2px;
  }

  .msg-reply-preview {
    display: flex;
    flex-direction: column;
    padding: 4px 8px;
    margin-bottom: 4px;
    border-left: 3px solid rgba(125, 54, 64, 0.5);
    border-radius: 0 6px 6px 0;
    background: rgba(0, 0, 0, 0.05);
    max-width: 100%;
    overflow: hidden;
  }
  .msg-bubble--mine .msg-reply-preview {
    border-left-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.12);
  }
  .msg-reply-author {
    font-size: 0.6875rem;
    font-weight: 700;
    opacity: 0.8;
  }
  .msg-reply-text {
    font-size: 0.75rem;
    opacity: 0.7;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .msg-content {
    display: inline;
    font-size: 0.9375rem;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .msg-meta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    float: right;
    margin-left: 8px;
    margin-top: 4px;
    font-size: 0.6875rem;
    opacity: 0.6;
  }
  .msg-edited {
    font-style: italic;
  }

  .msg-reactions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
    padding-left: 4px;
  }
  .msg-reactions--mine {
    justify-content: flex-end;
    padding-right: 4px;
    padding-left: 0;
  }

  .msg-reaction-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid rgba(28, 25, 23, 0.1);
    background: var(--surface-elevated);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 0.15s;
  }
  .msg-reaction-chip:hover {
    transform: scale(1.1);
  }
  .msg-reaction-chip--active {
    border-color: var(--primary);
    background: rgba(125, 54, 64, 0.08);
  }
  .msg-reaction-count {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .msg-actions-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
  }

  .msg-actions {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 101;
    display: flex;
    flex-direction: column;
    background: var(--surface-elevated);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    overflow: hidden;
    min-width: 180px;
    animation: msgActionsFade 0.15s ease;
  }
  .msg-actions--mine {
    left: auto;
    right: 0;
  }

  @keyframes msgActionsFade {
    from { opacity: 0; transform: translateY(-4px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  .msg-actions button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }
  .msg-actions button:hover {
    background: rgba(28, 25, 23, 0.04);
  }
  .msg-actions__danger {
    color: #dc2626 !important;
  }

  .msg-quick-reactions {
    display: flex;
    gap: 2px;
    padding: 6px 10px;
    border-top: 1px solid rgba(28, 25, 23, 0.06);
  }
  .msg-quick-reaction {
    font-size: 1.25rem;
    padding: 4px 6px;
    border-radius: 6px;
    min-width: 0 !important;
  }
  .msg-quick-reaction:hover {
    background: rgba(28, 25, 23, 0.06) !important;
    transform: scale(1.2) !important;
  }
`;
