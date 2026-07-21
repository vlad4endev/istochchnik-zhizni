import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuCheck, LuLoaderCircle, LuSearch, LuX } from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { emitAppToast } from '../../../lib/uiFeedback';
import {
  forwardMessage,
  type ConversationListItem,
} from '../api/messengerApi';
import { useChatStore } from '../chatStore';

type ForwardMessageSheetProps = {
  open: boolean;
  onClose: () => void;
  messageId: string;
  /** Exclude current chat from the list (still allowed by API). */
  sourceConversationId?: string;
};

function conversationTitle(c: ConversationListItem): string {
  if (c.type === 'private' && c.other_member) {
    const om = c.other_member;
    const fl = `${om.first_name ?? ''} ${om.last_name ?? ''}`.trim();
    return fl || om.name || `Участник ${om.id}`;
  }
  return c.title?.trim() || (c.type === 'channel' ? 'Канал' : 'Группа');
}

function conversationAvatar(c: ConversationListItem): string | null {
  if (c.type === 'private' && c.other_member?.avatar_url) return c.other_member.avatar_url;
  return c.avatar_url;
}

export function ForwardMessageSheet({
  open,
  onClose,
  messageId,
  sourceConversationId,
}: ForwardMessageSheetProps) {
  const conversations = useChatStore((s) => s.conversations);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => /^\d+$/.test(String(c.id)))
      .filter((c) => String(c.id) !== String(sourceConversationId ?? ''))
      .filter((c) => {
        if (!q) return true;
        return conversationTitle(c).toLowerCase().includes(q);
      })
      .slice(0, 80);
  }, [conversations, query, sourceConversationId]);

  if (!open || typeof document === 'undefined') return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    const ids = [...selected];
    if (ids.length === 0 || sending) return;
    setSending(true);
    try {
      const res = await forwardMessage(messageId, ids);
      const n = res.forwarded?.length ?? 0;
      emitAppToast(
        n === 1 ? 'Сообщение переслано' : `Переслано в ${n} чата`,
        'success',
      );
      setSelected(new Set());
      setQuery('');
      onClose();
    } catch (e: unknown) {
      const fromApi =
        e && typeof e === 'object' && 'response' in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      emitAppToast(
        typeof fromApi === 'string' && fromApi.trim() ? fromApi : 'Не удалось переслать',
        'error',
      );
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    if (sending) return;
    setSelected(new Set());
    setQuery('');
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120001] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fwd-sheet-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        className="flex max-h-[min(88dvh,560px)] w-full max-w-md flex-col overflow-hidden rounded-t-[18px] bg-white shadow-2xl sm:rounded-[14px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h2 id="fwd-sheet-title" className="truncate text-[15px] font-semibold text-stone-900">
              Переслать
            </h2>
            <p className="text-[13px] text-stone-500">
              {selected.size > 0 ? `Выбрано: ${selected.size}` : 'Выберите чаты'}
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
              autoFocus
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-stone-500">Нет доступных чатов</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {rows.map((c) => {
                const id = String(c.id);
                const title = conversationTitle(c);
                const checked = selected.has(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50"
                      onClick={() => toggle(id)}
                    >
                      <AppAvatar
                        className="h-10 w-10 shrink-0 overflow-hidden rounded-full"
                        src={conversationAvatar(c)}
                        alt=""
                        initialsFallbackText={title}
                        initialsColorSeed={id}
                        priority
                        fallback={
                          <div className="grid h-full w-full place-items-center text-sm font-semibold text-stone-500">
                            ?
                          </div>
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[16px] text-stone-900">{title}</span>
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

        <footer className="shrink-0 border-t border-black/[0.06] p-3">
          <button
            type="button"
            disabled={selected.size === 0 || sending}
            onClick={() => {
              void handleForward();
            }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-500 text-[15px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? <LuLoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : null}
            Переслать
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
