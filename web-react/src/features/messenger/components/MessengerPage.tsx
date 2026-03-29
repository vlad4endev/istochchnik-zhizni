import { useEffect, useCallback } from 'react';
import { useChatStore } from '../chatStore';
import { useMessengerWs } from '../useMessengerWs';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { useState } from 'react';

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const ws = useMessengerWs();

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = useCallback((id: string) => {
    setActive(id);
    setMobileShowChat(true);
  }, [setActive]);

  const handleBackToList = useCallback(() => {
    setMobileShowChat(false);
  }, []);

  return (
    <div className="messenger-page">
      {/* Sidebar — chat list */}
      <aside className={`messenger-sidebar ${mobileShowChat ? 'messenger-sidebar--hidden-mobile' : ''}`}>
        <div className="messenger-sidebar__header">
          <h1 className="messenger-sidebar__title">Сообщения</h1>
          <button
            type="button"
            className="messenger-new-btn"
            onClick={() => setShowNewChat(true)}
            aria-label="Новый чат"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              <line x1="12" y1="8" x2="12" y2="14" />
              <line x1="9" y1="11" x2="15" y2="11" />
            </svg>
          </button>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>

      {/* Chat window */}
      <main className={`messenger-main ${mobileShowChat ? 'messenger-main--show-mobile' : ''}`}>
        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            onBack={handleBackToList}
            sendTypingStart={ws.sendTypingStart}
            sendTypingStop={ws.sendTypingStop}
          />
        ) : (
          <div className="messenger-empty">
            <div className="messenger-empty__icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <p className="messenger-empty__text">Выберите чат или начните новый</p>
          </div>
        )}
      </main>

      {/* New chat dialog */}
      {showNewChat && (
        <NewChatDialog
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => {
            setShowNewChat(false);
            handleSelectConversation(id);
          }}
        />
      )}

      <style>{messengerStyles}</style>
    </div>
  );
}

const messengerStyles = `
  .messenger-page {
    display: flex;
    height: 100%;
    min-height: calc(100dvh - 60px);
    max-height: calc(100dvh - 60px);
    overflow: hidden;
    background: var(--surface);
  }
  @media (max-width: 767px) {
    .messenger-page {
      min-height: calc(100dvh - 130px);
      max-height: calc(100dvh - 130px);
    }
  }

  .messenger-sidebar {
    width: 340px;
    min-width: 340px;
    max-width: 340px;
    display: flex;
    flex-direction: column;
    background: var(--surface-elevated);
    border-right: 1px solid rgba(28, 25, 23, 0.08);
    overflow: hidden;
  }

  .messenger-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid rgba(28, 25, 23, 0.06);
  }

  .messenger-sidebar__title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .messenger-new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: var(--primary);
    color: white;
    cursor: pointer;
    transition: all 0.15s;
  }
  .messenger-new-btn:hover {
    background: var(--primary-dark);
    transform: scale(1.05);
  }
  .messenger-new-btn:active {
    transform: scale(0.95);
  }

  .messenger-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .messenger-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
  }
  .messenger-empty__icon {
    opacity: 0.5;
  }
  .messenger-empty__text {
    font-size: 0.95rem;
    font-weight: 500;
  }

  /* Mobile: show/hide sidebar vs chat */
  @media (max-width: 767px) {
    .messenger-sidebar {
      width: 100%;
      min-width: 100%;
      max-width: 100%;
    }
    .messenger-sidebar--hidden-mobile {
      display: none;
    }
    .messenger-main {
      display: none;
    }
    .messenger-main--show-mobile {
      display: flex;
    }
  }
`;
