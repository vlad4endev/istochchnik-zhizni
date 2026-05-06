import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from '../../chat/components/ChatList';
import { useSocket } from '../../chat/hooks/useSocket';
import { MessengerChatSession } from '../../chat/MessengerChatSession';
import { MessengerChatUiProvider } from '../../chat/MessengerChatUiProvider';
import { LuMoon, LuPlus, LuMessageSquare, LuSlidersHorizontal, LuSun } from 'react-icons/lu';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import { useAppearanceStore } from '../../../stores/useAppearanceStore';
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
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current != null) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  const runTransitionWindow = useCallback(() => {
    setIsTransitioning(true);
    clearTransitionTimer();
    transitionTimerRef.current = setTimeout(() => {
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, 350);
  }, [clearTransitionTimer]);

  useEffect(() => {
    return () => clearTransitionTimer();
  }, [clearTransitionTimer]);


  const { sendMessage, sendTyping } = useSocket();
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);

  const toggleMessengerTheme = useCallback(() => {
    if (theme === 'dark') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'light' : 'dark');
    }
  }, [theme, setTheme]);

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
    runTransitionWindow();
    setActive(id);
    setMobileView('chat');
  }, [runTransitionWindow, setActive]);

  const handleBack = useCallback(() => {
    blurActiveElement();
    runTransitionWindow();
    // Совпадает с messenger.css (split ≥769px) и messengerReadSurface (≤768px «только чат»).
    const stackLayout =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    // В одноколоночном режиме «назад» снимает выбор: иначе ChatWindow остаётся смонтированным
    // и продолжает markAsRead / WS auto-read, пока виден только список.
    if (activeId && (stackLayout || isDraftPrivateConversationId(activeId))) {
      setActive(null);
    }
    setMobileView('list');
  }, [activeId, runTransitionWindow, setActive]);

  return (
    <MessengerChatUiProvider>
    <div className="tg-messenger-page messenger-layout flex h-full min-h-0 flex-1 flex-col bg-white dark:bg-gray-950">
      <div
        className={`tg-messenger min-h-0 flex-1 bg-white dark:bg-gray-950 tg-density--${density} ${isTransitioning ? 'transitioning' : ''}`}
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              onClick={toggleMessengerTheme}
              title="Тема"
              aria-label="Переключить тему"
            >
              {theme === 'dark' ||
              (theme === 'system' && typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) ? (
                <LuSun size={18} />
              ) : (
                <LuMoon size={18} />
              )}
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
        <ChatList onSelect={handleSelectConversation} activeId={activeId} withChrome={false} />
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
        {activeId && isDraftPrivateConversationId(activeId) ? (
          <Suspense fallback={<MessengerFallback title="Загрузка чата…" />}>
            <ChatWindow
              conversationId={activeId}
              onBack={handleBack}
              sendTypingStart={(id) => sendTyping(id, 'start')}
              sendTypingStop={(id) => sendTyping(id, 'stop')}
            />
          </Suspense>
        ) : activeId ? (
          <MessengerChatSession
            conversationId={activeId}
            onBack={handleBack}
            sendMessage={sendMessage}
            sendTyping={sendTyping}
          />
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
    </MessengerChatUiProvider>
  );
}
