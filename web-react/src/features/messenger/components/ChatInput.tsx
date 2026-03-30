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
  const saveDraft = useChatStore((s) => s.saveDraft);
  const drafts = useChatStore((s) => s.drafts);
  const clearDraft = useChatStore((s) => s.clearDraft);

  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load draft on conversation change
  useEffect(() => {
    const draft = drafts[conversationId] || '';
    setContent(draft);
  }, [conversationId, drafts]);

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
    clearDraft(conversationId);

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
    const value = e.target.value;
    setContent(value);

    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;

    // Typing indicator
    sendTypingStart(conversationId);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTypingStop(conversationId);
    }, 3000);

    // Auto-save draft with debounce
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      saveDraft(conversationId, value);
    }, 500);
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
          style={{ opacity: content.trim() ? 1 : 0.5 }}
        >
          <LuSend size={18} style={{ marginLeft: '1px' }} />
        </button>
      </div>
    </div>
  );
}
