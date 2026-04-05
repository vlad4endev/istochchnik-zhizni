import { useEffect, useCallback, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { useMessengerWs } from '../useMessengerWs';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { NewChatDialog } from './NewChatDialog';
import { LuPlus, LuMessageSquare } from 'react-icons/lu';
import './messenger.css';
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
  const degradedMode = useChatStore((s) => s.degradedMode);
  const outboxSize = useChatStore((s) => s.outboxSize);
  const retryAllFailed = useChatStore((s) => s.retryAllFailed);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  const messengerRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const ws = useMessengerWs();

  useEffect(() => {
    document.documentElement.dataset.messengerOpen = '1';
    return () => { delete document.documentElement.dataset.messengerOpen; };
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
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
    if (activeId && isDraftPrivateConversationId(activeId)) {
      setActive(null);
    }
    setMobileView('list');
    setTimeout(() => setIsTransitioning(false), 350);
  }, [activeId, setActive]);

  return (
    <div className="tg-messenger-page">
      {(degradedMode || outboxSize > 0 || !isOnline) && (
        <div className="sticky top-0 z-[500] md:hidden">
          <div className="mx-auto w-full bg-amber-50 px-3 py-2 text-amber-900 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-amber-200/70 [padding-top:max(0.5rem,env(safe-area-inset-top,0px))]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-extrabold">
                  {!isOnline ? 'Нет сети' : 'Автономный режим'}
                  {outboxSize > 0 ? ` · В очереди: ${outboxSize}` : ''}
                </div>
                <div className="truncate text-[11px] font-semibold text-amber-800/90">
                  Мессенджер продолжит работу и отправит сообщения, когда связь восстановится.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void retryAllFailed()}
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-amber-200/70 px-3 py-1.5 text-[11px] font-extrabold text-amber-950 hover:bg-amber-200 active:scale-[0.99]"
                aria-label="Отправить сейчас"
                title="Отправить сейчас"
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      )}
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
    </div>
  );
}
