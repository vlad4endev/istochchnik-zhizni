import { useEffect, useCallback, useState, useRef } from 'react';
import { useChatStore } from '../chatStore';
import { useMessengerWs } from '../useMessengerWs';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { LuPlus, LuMessageSquare } from 'react-icons/lu';
import './messenger.css';

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const messengerRef = useRef<HTMLDivElement>(null);

  const ws = useMessengerWs();

  // Swipe right to go back from chat to list
  useSwipeGesture(messengerRef, {
    onSwipeRight: () => {
      if (mobileView === 'chat' && !isTransitioning) {
        handleBack();
      }
    },
    minDistance: 50,
    minVelocity: 100,
  });

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const handleSelectConversation = useCallback((id: string) => {
    setIsTransitioning(true);
    setActive(id);
    setMobileView('chat');
    setTimeout(() => setIsTransitioning(false), 350);
  }, [setActive]);

  const handleBack = useCallback(() => {
    setIsTransitioning(true);
    setMobileView('list');
    setTimeout(() => setIsTransitioning(false), 350);
  }, []);

  return (
    <div className={`tg-messenger ${isTransitioning ? 'transitioning' : ''}`} ref={messengerRef}>
      {/* Sidebar */}
      <aside className={`tg-sidebar ${mobileView === 'chat' ? 'tg-sidebar--hidden' : ''}`}>
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">Мессенджер</h1>
          <button 
            type="button"
            className="tg-compose-btn" 
            onClick={() => setShowNewChat(true)} 
            aria-label="Новый чат"
          >
            <LuPlus size={24} />
          </button>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>

      {/* Main chat area */}
      <main className={`tg-main ${mobileView === 'chat' ? 'tg-main--visible' : ''}`}>
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
              <LuMessageSquare size={80} strokeWidth={1} />
            </div>
            <h2 className="tg-empty-title">Выберите чат</h2>
            <p className="tg-empty-sub">или создайте новый, нажав на <strong>+</strong></p>
          </div>
        )}
      </main>

      {showNewChat && (
        <NewChatDialog
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => { 
            setShowNewChat(false); 
            handleSelectConversation(id); 
          }}
        />
      )}
    </div>
  );
}
