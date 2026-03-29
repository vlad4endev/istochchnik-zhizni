import { useEffect, useCallback, useState } from 'react';
import { useChatStore } from '../chatStore';
import { useMessengerWs } from '../useMessengerWs';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import './messenger.css';

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const ws = useMessengerWs();

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = useCallback((id: string) => {
    setActive(id);
    setMobileView('chat');
  }, [setActive]);

  const handleBack = useCallback(() => {
    setMobileView('list');
  }, []);

  return (
    <div className="tg-messenger">
      {/* Sidebar */}
      <aside className={`tg-sidebar${mobileView === 'chat' ? ' tg-sidebar--hidden' : ''}`}>
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">Чаты</h1>
          <button className="tg-icon-btn tg-compose-btn" onClick={() => setShowNewChat(true)} aria-label="Новый чат">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>

      {/* Main chat area */}
      <main className={`tg-main${mobileView === 'chat' ? ' tg-main--visible' : ''}`}>
        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            onBack={handleBack}
            sendTypingStart={ws.sendTypingStart}
            sendTypingStop={ws.sendTypingStop}
          />
        ) : (
          <div className="tg-empty-state">
            <div className="tg-empty-icon">
              <svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <h2 className="tg-empty-title">Выберите чат</h2>
            <p className="tg-empty-sub">или создайте новый, нажав на <strong>+</strong></p>
          </div>
        )}
      </main>

      {showNewChat && (
        <NewChatDialog
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => { setShowNewChat(false); handleSelectConversation(id); }}
        />
      )}
    </div>
  );
}
