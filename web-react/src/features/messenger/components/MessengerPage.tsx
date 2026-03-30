import { useEffect, useCallback, useState, useRef } from 'react';
import { useChatStore } from '../chatStore';
import { useMessengerWs } from '../useMessengerWs';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { LuChevronLeft, LuChevronRight, LuMessageSquare, LuPlus } from 'react-icons/lu';
import './messenger.css';

const SIDEBAR_COLLAPSED_KEY = 'tg_sidebar_collapsed';

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      setSidebarCollapsed(raw === '1');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

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
    <div className="tg-messenger-page">
      <div
        className={`tg-messenger ${isTransitioning ? 'transitioning' : ''} ${
          sidebarCollapsed ? 'tg-messenger--sidebar-collapsed' : ''
        }`}
        ref={messengerRef}
      >
      {/* Sidebar */}
      <aside
        className={`tg-sidebar ${mobileView === 'list' ? 'tg-sidebar--visible' : ''} ${
          mobileView === 'chat' ? 'tg-sidebar--hidden' : ''
        } ${sidebarCollapsed ? 'tg-sidebar--collapsed' : ''}`}
      >
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">{sidebarCollapsed ? 'Чаты' : 'Мессенджер'}</h1>
          <div className="tg-sidebar-header-actions">
            <button
              type="button"
              className="tg-icon-btn tg-sidebar-toggle"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
              title={sidebarCollapsed ? 'Развернуть' : 'Свернуть'}
            >
              {sidebarCollapsed ? <LuChevronRight size={20} strokeWidth={2.25} /> : <LuChevronLeft size={20} strokeWidth={2.25} />}
            </button>
            <button
              type="button"
              className="tg-compose-btn"
              onClick={() => setShowNewChat(true)}
              aria-label="Новый чат"
            >
              <LuPlus size={24} />
            </button>
          </div>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>

      {/* Main chat area */}
      <main className={`tg-main ${mobileView === 'chat' ? 'tg-main--visible' : ''}`}>
        {activeId ? (
          <ChatWindow
            conversationId={activeId}
            onBack={handleBack}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebarCollapsed={toggleSidebarCollapsed}
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
    </div>
  );
}
