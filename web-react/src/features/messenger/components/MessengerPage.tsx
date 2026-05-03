import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { useMessengerWsContext } from '../MessengerWsContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { LuPlus, LuMessageSquare, LuSlidersHorizontal } from 'react-icons/lu';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import './messenger.css';

const ChatWindow = lazy(async () => {
  const m = await import('./ChatWindow');
  return { default: m.ChatWindow };
});

const NewChatDialog = lazy(async () => {
  const m = await import('./NewChatDialog');
  return { default: m.NewChatDialog };
});

function MessengerFallback({ title }: { title: string }) {
  return (
    <div className="p-4">
      <div className="mx-auto w-full max-w-xl space-y-2.5">
        <SkeletonBox width="38%" height="14px" />
        <SkeletonBox width="100%" height="52px" radius="10px" />
        <SkeletonBox width="100%" height="52px" radius="10px" />
      </div>
      <p className="mt-3 text-xs font-medium text-stone-500">{title}</p>
    </div>
  );
}
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
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return window.localStorage.getItem('messenger:desktop-density') === 'compact' ? 'compact' : 'comfortable';
  });
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

  /**
   * PWA / узкий экран: в режиме «только чат» скрываем нижний таббар через Layout (как SongDetail),
   * чтобы не дублировать отступы `main` и не ловить «прыжки» при появлении клавиатуры.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stackLayout = window.matchMedia('(max-width: 768px)').matches;
    if (!stackLayout) return;
    if (mobileView === 'chat') {
      dispatchLayoutMainChrome(false);
    } else {
      dispatchLayoutMainChrome(true);
    }
    return () => {
      dispatchLayoutMainChrome(true);
    };
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('messenger:desktop-density', density);
  }, [density]);

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
    // Совпадает с messenger.css (split ≥769px) и messengerReadSurface (≤768px «только чат»).
    const stackLayout =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    // В одноколоночном режиме «назад» снимает выбор: иначе ChatWindow остаётся смонтированным
    // и продолжает markAsRead / WS auto-read, пока виден только список.
    if (activeId && (stackLayout || isDraftPrivateConversationId(activeId))) {
      setActive(null);
    }
    setMobileView('list');
    setTimeout(() => setIsTransitioning(false), 350);
  }, [activeId, setActive]);

  return (
    <div className="tg-messenger-page messenger-layout flex h-full min-h-0 flex-1 flex-col bg-white">
      <div
        className={`tg-messenger min-h-0 flex-1 bg-white tg-density--${density} ${isTransitioning ? 'transitioning' : ''}`}
        ref={messengerRef}
      >
      {/* Sidebar */}
      <aside
        className={`tg-sidebar chat-list-panel ${mobileView === 'list' ? 'tg-sidebar--visible' : ''} ${mobileView === 'chat' ? 'tg-sidebar--hidden' : ''}`}
      >
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">Мессенджер</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`tg-density-toggle hidden md:inline-flex ${density === 'compact' ? 'tg-density-toggle--compact' : ''}`}
              onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
              aria-label={density === 'comfortable' ? 'Сделать плотнее' : 'Сделать свободнее'}
              title={density === 'comfortable' ? 'Компактно' : 'Свободно'}
            >
              <LuSlidersHorizontal size={16} strokeWidth={2.3} aria-hidden />
            </button>
            <button
              type="button"
              className="tg-compose-btn-sm"
              onClick={() => setShowNewChat(true)}
              aria-label="Новый чат"
            >
              <LuPlus size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>
        <ChatList onSelect={handleSelectConversation} activeId={activeId} />
      </aside>
      {mobileView === 'list' && activeId ? (
        <button
          type="button"
          className="tg-sidebar-overlay"
          onClick={() => setMobileView('chat')}
          aria-label="Закрыть список чатов"
        />
      ) : null}

      {/* Main chat area */}
      <main className={`tg-main chat-window-panel ${mobileView === 'chat' ? 'tg-main--visible' : ''}`}>
        {activeId ? (
          <Suspense fallback={<MessengerFallback title="Загрузка чата…" />}>
            <ChatWindow
              conversationId={activeId}
              onBack={handleBack}
              sendTypingStart={ws.sendTypingStart}
              sendTypingStop={ws.sendTypingStop}
            />
          </Suspense>
        ) : (
          <div className="tg-empty-state chat-empty-state">
            <div className="tg-empty-icon">
              <LuMessageSquare size={80} strokeWidth={1} />
            </div>
            <h2 className="tg-empty-title">Выберите чат</h2>
            <p className="tg-empty-sub">или создайте новый, нажав на <strong>+</strong></p>
          </div>
        )}
      </main>

      {showNewChat && (
        <Suspense fallback={<MessengerFallback title="Загрузка…" />}>
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
