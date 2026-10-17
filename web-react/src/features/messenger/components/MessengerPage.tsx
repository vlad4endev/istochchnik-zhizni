import { useEffect, useCallback, useState, useRef, lazy, Suspense, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LuPhone, LuPlus, LuMessageSquare, LuSlidersHorizontal, LuVideo } from 'react-icons/lu';
import { useChatStore, isDraftPrivateConversationId } from '../chatStore';
import { isConversationRemoved } from '../chatStoreWsBatch';
import { useMessengerWsContext } from '../MessengerWsContext';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { ChatList } from './ChatList';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { BodyPortal } from '../../../components/BodyPortal';
import { dispatchLayoutMainChrome } from '../../../app/layoutChrome';
import {
  readActiveMessengerConversation,
  saveActiveMessengerConversation,
} from '../../../lib/persistAppLocation';
import { syncViewportHeightVars } from '../../../lib/nativeShellViewport';
import './messenger.css';

const CALLS_FEATURE_ENABLED = import.meta.env.VITE_CALLS_ENABLED === 'true';

const ChatWindow = lazy(async () => {
  const m = await import('./ChatWindow');
  return { default: m.ChatWindow };
});

const NewChatDialog = lazy(async () => {
  const m = await import('./NewChatDialog');
  return { default: m.NewChatDialog };
});

const CreateMeetingDialog = lazy(async () => {
  const m = await import('../../calls/CreateMeetingDialog');
  return { default: m.CreateMeetingDialog };
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
  const [callsMenuOpen, setCallsMenuOpen] = useState(false);
  const [meetingMedia, setMeetingMedia] = useState<'audio' | 'video' | null>(null);
  const [callsMenuPos, setCallsMenuPos] = useState<{ top: number; right: number } | null>(null);
  const callsBtnRef = useRef<HTMLButtonElement | null>(null);
  const callsMenuRef = useRef<HTMLDivElement | null>(null);
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
    // Сразу пересчитываем --viewport-height / inline heights: иначе после фото
    // в чате укороченная высота может остаться до следующего resize.
    syncViewportHeightVars();
    return () => {
      delete document.documentElement.dataset.chatOpen;
      syncViewportHeightVars();
    };
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

  // Deep-link from push / dashboard / cold start: /messenger?conversationId=123|draft:42
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const convId = params.get('conversationId')?.trim() ?? '';
    if (!convId) return;
    if (isConversationRemoved(convId)) {
      setActive(null);
      saveActiveMessengerConversation(null);
      navigate('/messenger', { replace: true });
      return;
    }
    setMobileView('chat');
    saveActiveMessengerConversation(convId);
    if (isDraftPrivateConversationId(convId)) {
      void ensurePrivateDraftFromConversationId(convId);
      return;
    }
    setActive(convId);
  }, [location.search, navigate, setActive, ensurePrivateDraftFromConversationId]);

  const conversations = useChatStore((s) => s.conversations);
  useEffect(() => {
    if (!activeId || !isConversationRemoved(activeId)) return;
    setActive(null);
    saveActiveMessengerConversation(null);
    setMobileView('list');
    navigate('/messenger', { replace: true });
  }, [activeId, conversations, navigate, setActive]);

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
    // Пока deep-link `?conversationId=` ещё резолвится, не затираем сохранённый id нулём.
    if (activeId == null) {
      const pending = new URLSearchParams(location.search).get('conversationId')?.trim() ?? '';
      if (pending) return;
    }
    saveActiveMessengerConversation(activeId);
  }, [activeId, location.search]);

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
    // Совпадает с messenger.css (split ≥769px) и messengerReadSurface (≤768px «только чат»).
    const stackLayout =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    // В одноколоночном режиме «назад» снимает выбор: иначе ChatWindow остаётся смонтированным
    // и продолжает markAsRead / WS auto-read, пока виден только список.
    if (activeId && (stackLayout || isDraftPrivateConversationId(activeId))) {
      setActive(null);
      saveActiveMessengerConversation(null);
    }
    setMobileView('list');
    navigate('/messenger', { replace: true });
  }, [activeId, navigate, runTransitionWindow, setActive]);

  const repositionCallsMenu = useCallback(() => {
    const btn = callsBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const pad = 8;
    setCallsMenuPos({
      top: Math.round(rect.bottom + pad),
      right: Math.max(pad, Math.round(window.innerWidth - rect.right)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!callsMenuOpen) return;
    repositionCallsMenu();
    const onReposition = () => repositionCallsMenu();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [callsMenuOpen, repositionCallsMenu]);

  useEffect(() => {
    if (!callsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (callsBtnRef.current?.contains(t)) return;
      if (callsMenuRef.current?.contains(t)) return;
      setCallsMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCallsMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [callsMenuOpen]);

  const openMeeting = useCallback((media: 'audio' | 'video') => {
    setCallsMenuOpen(false);
    setMeetingMedia(media);
  }, []);

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
          <div className="tg-sidebar-actions">
            <button
              type="button"
              className={`tg-density-toggle hidden md:inline-flex ${density === 'compact' ? 'tg-density-toggle--compact' : ''}`}
              onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
              aria-label={density === 'comfortable' ? 'Сделать плотнее' : 'Сделать свободнее'}
              title={density === 'comfortable' ? 'Компактно' : 'Свободно'}
            >
              <LuSlidersHorizontal size={16} strokeWidth={2.3} aria-hidden />
            </button>
            {CALLS_FEATURE_ENABLED ? (
              <button
                type="button"
                ref={callsBtnRef}
                className="tg-calls-btn-sm tap-compact"
                onClick={() => setCallsMenuOpen((v) => !v)}
                aria-label="Новая встреча"
                title="Новая встреча"
                aria-haspopup="menu"
                aria-expanded={callsMenuOpen}
              >
                <LuVideo size={20} strokeWidth={2.35} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              className="tg-compose-btn-sm tap-compact"
              onClick={() => {
                setCallsMenuOpen(false);
                setShowNewChat(true);
              }}
              aria-label="Создать чат"
              title="Новый чат"
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
            <p className="tg-empty-sub">
              {CALLS_FEATURE_ENABLED
                ? <>чат — на <strong>+</strong>, встреча — на кнопку с камерой</>
                : <>или создайте новый, нажав на <strong>+</strong></>}
            </p>
          </div>
        )}
      </main>

      {callsMenuOpen && callsMenuPos ? (
        <BodyPortal>
          <div
            ref={callsMenuRef}
            role="menu"
            aria-label="Создать встречу"
            className="tg-calls-menu"
            style={{ top: callsMenuPos.top, right: callsMenuPos.right }}
          >
            <button
              type="button"
              role="menuitem"
              className="tg-calls-menu__item"
              onClick={() => openMeeting('video')}
            >
              <span className="tg-calls-menu__icon tg-calls-menu__icon--video" aria-hidden>
                <LuVideo size={20} strokeWidth={2.2} />
              </span>
              <span className="tg-calls-menu__copy">
                <span className="tg-calls-menu__title">Видеовстреча</span>
                <span className="tg-calls-menu__sub">Камера и ссылка сразу</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="tg-calls-menu__item"
              onClick={() => openMeeting('audio')}
            >
              <span className="tg-calls-menu__icon" aria-hidden>
                <LuPhone size={20} strokeWidth={2.2} />
              </span>
              <span className="tg-calls-menu__copy">
                <span className="tg-calls-menu__title">Аудиовстреча</span>
                <span className="tg-calls-menu__sub">Только голос · по ссылке</span>
              </span>
            </button>
          </div>
        </BodyPortal>
      ) : null}

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

      {meetingMedia ? (
        <Suspense fallback={null}>
          <CreateMeetingDialog
            mediaType={meetingMedia}
            onClose={() => setMeetingMedia(null)}
            onCreated={() => {
              setMeetingMedia(null);
            }}
          />
        </Suspense>
      ) : null}
      </div>
    </div>
  );
}
