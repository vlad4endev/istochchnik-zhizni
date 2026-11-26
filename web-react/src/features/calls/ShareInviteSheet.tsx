import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuLoaderCircle, LuSearch, LuShare2, LuX } from 'react-icons/lu';

import { AppAvatar } from '../../components/AppAvatar';
import { useBackLayer } from '../../lib/backLayers';
import { emitAppToast } from '../../lib/uiFeedback';
import { useChatStore } from '../messenger/chatStore';
import {
  canSendTextToConversation,
  conversationAvatar,
  conversationTitle,
} from '../messenger/conversationDisplay';

import type { CallMediaType } from './callsApi';
import { shareInviteLink } from './inviteShare';
import { formatInviteChatMessage, sendInviteToConversations } from './shareInviteToChats';

type ShareInviteSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  mediaType: CallMediaType;
};

const MAX_ROWS = 120;

export function ShareInviteSheet({ open, onClose, title, url, mediaType }: ShareInviteSheetProps) {
  const conversations = useChatStore((s) => s.conversations);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);

  useBackLayer(open, onClose);

  useEffect(() => {
    if (open && !conversationsLoaded) void loadConversations();
  }, [open, conversationsLoaded, loadConversations]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && !sending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, sending]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter(canSendTextToConversation)
      .filter((c) => !q || conversationTitle(c).toLowerCase().includes(q))
      .slice(0, MAX_ROWS);
  }, [conversations, query]);

  const reset = useCallback(() => {
    setSelected(new Set());
    setQuery('');
  }, []);

  const handleClose = useCallback(() => {
    if (sending) return;
    reset();
    onClose();
  }, [onClose, reset, sending]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    const ids = [...selected];
    if (ids.length === 0 || sending || !url.trim()) return;
    setSending(true);
    try {
      const result = await sendInviteToConversations(
        ids,
        formatInviteChatMessage(title, url, mediaType),
      );
      const sentCount = result.sent.length;
      if (result.failed.length === 0) {
        emitAppToast(
          sentCount === 1 ? 'Приглашение отправлено' : `Приглашение отправлено в чаты: ${sentCount}`,
          'success',
        );
        reset();
        onClose();
        return;
      }
      const byId = new Map(conversations.map((c) => [String(c.id), c]));
      const names = result.failed
        .map((f) => {
          const conv = byId.get(f.conversationId);
          return conv ? conversationTitle(conv) : f.conversationId;
        })
        .join(', ');
      emitAppToast(
        sentCount > 0
          ? `Отправлено: ${sentCount}. Не удалось: ${names}`
          : `Не удалось отправить: ${names}`,
        'error',
      );
      // Оставляем выбранными только неудачные, чтобы повторить одним нажатием.
      setSelected(new Set(result.failed.map((f) => f.conversationId)));
    } finally {
      setSending(false);
    }
  };

  const handleSystemShare = async () => {
    const result = await shareInviteLink(title, url);
    if (result === 'copied') emitAppToast('Название и ссылка скопированы', 'success');
    else if (result === 'failed') emitAppToast('Не удалось поделиться ссылкой', 'error');
  };

  if (!open || typeof document === 'undefined') return null;

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof (navigator as Navigator).share === 'function';

  return createPortal(
    <div
      className="fixed inset-0 z-[120001] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-invite-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="flex max-h-[min(88dvh,600px)] w-full max-w-md flex-col overflow-hidden rounded-t-[18px] bg-white shadow-2xl sm:rounded-[14px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="share-invite-title" className="truncate text-[15px] font-semibold text-stone-900">
              Поделиться приглашением
            </h2>
            <p className="truncate text-[13px] text-stone-500">
              {selected.size > 0 ? `Выбрано: ${selected.size}` : `Выберите чаты — «${title}»`}
            </p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
            onClick={handleClose}
            aria-label="Закрыть"
            disabled={sending}
          >
            <LuX size={22} />
          </button>
        </header>

        <div className="shrink-0 border-b border-black/[0.06] px-3 py-2">
          <label className="flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2">
            <LuSearch className="h-4 w-4 shrink-0 text-stone-400" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск чатов"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
              aria-label="Поиск чатов"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">
              {!conversationsLoaded
                ? 'Загружаем чаты…'
                : query.trim()
                  ? 'Ничего не найдено'
                  : 'Нет чатов, куда можно отправить'}
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((c) => {
                const id = String(c.id);
                const chatTitle = conversationTitle(c);
                const checked = selected.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                      onClick={() => toggle(id)}
                      aria-pressed={checked}
                      disabled={sending}
                    >
                      <AppAvatar
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                        src={conversationAvatar(c)}
                        alt=""
                        initialsFallbackText={chatTitle}
                        initialsColorSeed={id}
                        priority
                        fallback={
                          <div className="grid h-full w-full place-items-center text-sm font-semibold text-stone-500">
                            ?
                          </div>
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[16px] text-stone-900">
                        {chatTitle}
                      </span>
                      <span
                        className={[
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full border',
                          checked
                            ? 'border-sky-500 bg-sky-500 text-white'
                            : 'border-stone-300 bg-white text-transparent',
                        ].join(' ')}
                        aria-hidden
                      >
                        <LuCheck size={14} strokeWidth={3} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="shrink-0 space-y-2 border-t border-black/[0.06] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            disabled={selected.size === 0 || sending || !url.trim()}
            onClick={() => void handleSend()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? <LuLoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {selected.size > 0 ? `Отправить (${selected.size})` : 'Отправить'}
          </button>
          {canNativeShare ? (
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSystemShare()}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
            >
              <LuShare2 className="h-4 w-4" aria-hidden />
              Через другое приложение
            </button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
