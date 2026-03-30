import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../chatStore';
import { LuPlus, LuSmile, LuSend } from 'react-icons/lu';

interface ChatInputProps {
  conversationId: string;
  sendTypingStart: (convId: string) => void;
  sendTypingStop: (convId: string) => void;
  canSend: boolean;
}

export function ChatInput({
  conversationId,
  sendTypingStart,
  sendTypingStop,
  canSend,
}: ChatInputProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const replyTo = useChatStore((s) => s.replyToMessage);
  const editing = useChatStore((s) => s.editingMessage);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditing = useChatStore((s) => s.setEditing);

  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync content with editing state
  useEffect(() => {
    if (editing) {
      setContent(editing.content);
      textareaRef.current?.focus();
    }
  }, [editing]);

  const handleSend = async () => {
    if (!content.trim()) return;
    const text = content.trim();
    setContent('');
    
    if (editing) {
      const msgId = editing.id;
      setEditing(null);
      await editMessage(msgId, text);
    } else {
      const replyId = replyTo?.id || null;
      setReplyTo(null);
      await sendMessage(conversationId, text, replyId);
    }
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    sendTypingStop(conversationId);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    
    // Typing indicator
    sendTypingStart(conversationId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === 'Escape') {
      if (editing) setEditing(null);
      if (replyTo) setReplyTo(null);
    }
  };

  if (!canSend) {
    return (
      <div className="tg-input-area" style={{ justifyContent: 'center' }}>
        <p className="tg-empty-sub">Вы не можете писать в этот канал</p>
      </div>
    );
  }

  return (
    <div className="tg-input-area-wrap">
      {/* Reply/Edit Banners */}
      {(replyTo || editing) && (
        <div className="tg-input-banner">
          <div className="tg-input-banner-icon">
            {replyTo ? '↩️' : '✏️'}
          </div>
          <div className="tg-input-banner-content">
            <div className="tg-input-banner-title">
              {replyTo ? `Ответ ${replyTo.sender_name}` : 'Редактирование'}
            </div>
            <div className="tg-input-banner-text">
              {replyTo ? replyTo.content : editing?.content}
            </div>
          </div>
          <button 
            type="button" 
            className="tg-input-banner-close"
            onClick={() => { setReplyTo(null); setEditing(null); }}
          >
            ✕
          </button>
        </div>
      )}

      <div className="tg-input-area">
        <div className="tg-input-container">
          <button type="button" className="tg-input-icon-btn"><LuPlus size={22} /></button>
          <textarea
            ref={textareaRef}
            className="tg-input-textarea"
            placeholder="Сообщение..."
            rows={1}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <button type="button" className="tg-input-icon-btn"><LuSmile size={22} /></button>
        </div>

        <button 
          type="button" 
          className="tg-send-btn"
          onClick={() => void handleSend()}
          disabled={!content.trim()}
          style={{ opacity: content.trim() ? 1 : 0.6 }}
        >
          <LuSend size={24} style={{ marginLeft: content.trim() ? '2px' : '0' }} />
        </button>
      </div>

      <style>{extraStyles}</style>
    </div>
  );
}

const extraStyles = `
  .tg-input-area-wrap {
    display: flex;
    flex-direction: column;
    width: 100%;
    position: relative;
    z-index: 10;
  }
  
  .tg-input-banner {
    background: var(--tg-surface);
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    border-top: 1px solid var(--tg-border);
    animation: tg-slide-up 0.2s ease;
  }
  
  .tg-input-banner-icon {
    font-size: 1.2rem;
    color: var(--tg-primary);
  }
  
  .tg-input-banner-content {
    flex: 1;
    min-width: 0;
  }
  
  .tg-input-banner-title {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--tg-primary);
  }
  
  .tg-input-banner-text {
    font-size: 0.875rem;
    color: var(--tg-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .tg-input-banner-close {
    background: transparent;
    border: none;
    color: var(--tg-text-muted);
    font-size: 1rem;
    cursor: pointer;
  }
  
  .tg-input-icon-btn {
    background: transparent;
    border: none;
    color: var(--tg-text-muted);
    padding: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.2s;
  }
  .tg-input-icon-btn:hover {
    color: var(--tg-primary);
  }
  
  @keyframes tg-slide-up {
    from { transform: translateY(100%); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
