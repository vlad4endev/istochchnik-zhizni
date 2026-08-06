import { useEffect, useCallback, useState, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { useMessengerWsContext } from '../MessengerWsContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { LuPlus, LuMessageSquare, LuSlidersHorizontal } from 'react-icons/lu';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import {
  readActiveMessengerConversation,
  saveActiveMessengerConversation,
} from '../../../lib/persistAppLocation';
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

function messengerPathWithConversation(id: string | null): string {
  if (!id) return '/messenger';
  return `/messenger?conversationId=${encodeURIComponent(id)}`;
}

export function MessengerPage() {
  const activeId = useChatStore((s) => s.activeConversationId);
  const setActive = useChatStore((s) => s.setActiveConversation);
  const ensurePrivateDraftFromConversationId = useChatStore((s) => s.ensurePrivateDraftFromConversationId);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(() => {
    if (typeof window === 'undefined') return 'list';
    const params = new URLSearchParams(window.location.search);
    if (params.get('conversationId')?.trim()) return 'chat';
    if (readActiveMessengerConversation()) return 'chat';
    return 'list';
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    if (typeof window === 'undefined') return 'comfortable';
    return window.localStorage.getItem('messenger:desktop-density') === 'compact' ? 'compact' : 'comfortable';
  });
  const messengerRef = useRef<HTMLDivElement>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredActiveRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
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
    const stackLayout = window.matchMedia('(max-width: 1023px)').matches;
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

  // Deep-link from push / dashboard / cold start: /messenger?conversationId=123|draft:42
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('conversationId')?.trim() ?? '';
    if (!convId) return;
    setMobileView('chat');
    saveActiveMessengerConversation(convId);
    if (isDraftPrivateConversationId(convId)) {
      void ensurePrivateDraftFromConversationId(convId);
      return;
    }
    setActive(convId);
  }, [location.search, setActive, ensurePrivateDraftFromConversationId]);

  // Cold start without query: restore last active chat from localStorage.
  useEffect(() => {
    if (restoredActiveRef.current) return;
    restoredActiveRef.current = true;
    const params = new URLSearchParams(location.search);
    if (params.get('conversationId')?.trim()) return;
    if (activeId) {
      setMobileView('chat');
      navigate(messengerPathWithConversation(activeId), { replace: true });
      return;
    }
    const saved = readActiveMessengerConversation();
    if (!saved) return;
    setMobileView('chat');
    if (isDraftPrivateConversationId(saved)) {
      void ensurePrivateDraftFromConversationId(saved);
    } else {
      setActive(saved);
    }
    navigate(messengerPathWithConversation(saved), { replace: true });
  }, [activeId, ensurePrivateDraftFromConversationId, location.search, navigate, setActive]);

  useEffect(() => {
    saveActiveMessengerConversation(activeId);
  }, [activeId]);

  const handleSelectConversation = useCallback((id: string) => {
    blurActiveElement();
    runTransitionWindow();
    setActive(id);
    setMobileView('chat');
    saveActiveMessengerConversation(id);
    navigate(messengerPathWithConversation(id), { replace: true });
  }, [navigate, runTransitionWindow, setActive]);

  const handleBack = useCallback(() => {
    blurActiveElement();
    runTransitionWindow();
    // Совпадает с messenger.css (split ≥1024px) и messengerReadSurface (≤1023px «только чат»).
    const stackLayout =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
    // В одноколоночном режиме «назад» снимает выбор: иначе ChatWindow остаётся смонтированным
    // и продолжает markAsRead / WS auto-read, пока виден только список.
    if (activeId && (stackLayout || isDraftPrivateConversationId(activeId))) {
      setActive(null);
      saveActiveMessengerConversation(null);
    }
    setMobileView('list');
    navigate('/messenger', { replace: true });
  }, [activeId, navigate, runTransitionWindow, setActive]);

  return (
    <div className="tg-messenger-page messenger-layout relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div
        className={`tg-messenger min-h-0 flex-1 bg-white tg-density--${density} ${isTransitioning ? 'transitioning' : ''}`}
        ref={messengerRef}
      >
      {/* Sidebar */}
      <aside
        className={`tg-sidebar chat-list-panel h-full min-h-0 ${mobileView === 'list' ? 'tg-sidebar--visible' : ''} ${mobileView === 'chat' ? 'tg-sidebar--hidden' : ''}`}
      >
        <div className="tg-sidebar-header">
          <h1 className="tg-sidebar-title">Чаты</h1>
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
