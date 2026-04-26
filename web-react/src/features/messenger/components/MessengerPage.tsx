import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { useMessengerWsContext } from '../MessengerWsContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { LuPlus, LuMessageSquare } from 'react-icons/lu';
import './messenger.css';

const ChatWindow = lazy(async () => {
  const m = await import('./ChatWindow');
  return { default: m.ChatWindow };
});

const NewChatDialog = lazy(async () => {
  const m = await import('./NewChatDialog');
  return { default: m.NewChatDialog };
});
function blurActiveElement() {
  try {
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
  } catch {
    /* ignore */
  }
}

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const messengerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const ws = useMessengerWsContext();

  useEffect(() => {
    document.documentElement.dataset.messengerOpen = '1';
    return () => { delete document.documentElement.dataset.messengerOpen; };
  }, []);

  useEffect(() => {
    if (mobileView === 'chat') {
      document.documentElement.dataset.chatOpen = '1';
    } else {
      delete document.documentElement.dataset.chatOpen;
    }
    return () => { delete document.documentElement.dataset.chatOpen; };
  }, [mobileView]);

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

  // Deep-link from push notification: /messenger?conversationId=123
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('conversationId');
    if (convId && convId.trim()) {
      setActive(convId.trim());
      setMobileView('chat');
    }
  }, [location.search, setActive]);

  const handleSelectConversation = useCallback((id: string) => {
    blurActiveElement();
    setIsTransitioning(true);
    setActive(id);
    setMobileView('chat');
    setTimeout(() => setIsTransitioning(false), 350);
  }, [setActive]);

  const handleBack = useCallback(() => {
    blurActiveElement();
    setIsTransitioning(true);
    const narrow =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    // На мобилке «назад» = выход из экрана чата: иначе activeId остаётся, ChatWindow в фоне
    // всё ещё дергает markAsRead / WS auto-read — счётчик непрочитанных обнуляется в списке.
    if (activeId && (narrow || isDraftPrivateConversationId(activeId))) {
      setActive(null);
    }
    setMobileView('list');
    setTimeout(() => setIsTransitioning(false), 350);
  }, [activeId, setActive]);

  return (
    <div className="tg-messenger-page">
      <div className={`tg-messenger ${isTransitioning ? 'transitioning' : ''}`} ref={messengerRef}>
      {/* Sidebar */}
      <aside
        className={`tg-sidebar ${mobileView === 'list' ? 'tg-sidebar--visible' : ''} ${mobileView === 'chat' ? 'tg-sidebar--hidden' : ''}`}
      >
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">Мессенджер</h1>
          <button
            type="button"
            className="tg-compose-btn-sm"
            onClick={() => setShowNewChat(true)}
            aria-label="Новый чат"
          >
            <LuPlus size={20} strokeWidth={2.5} />
          </button>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>

      {/* Main chat area */}
      <main className={`tg-main ${mobileView === 'chat' ? 'tg-main--visible' : ''}`}>
        {activeId ? (
          <Suspense fallback={<div className="tg-empty-sub">Загрузка чата…</div>}>
            <ChatWindow
              conversationId={activeId}
              onBack={handleBack}
              sendTypingStart={ws.sendTypingStart}
              sendTypingStop={ws.sendTypingStop}
            />
          </Suspense>
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
        <Suspense fallback={<div className="tg-empty-sub">Загрузка…</div>}>
          <NewChatDialog
            onClose={() => setShowNewChat(false)}
            onCreated={(id) => {
              setShowNewChat(false);
              handleSelectConversation(id);
            }}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
}
