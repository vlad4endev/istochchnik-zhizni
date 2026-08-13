import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  LuArrowDown,
  LuArrowLeft,
  LuBot,
  LuClipboardCopy,
  LuCopy,
  LuLoader,
  LuMessagesSquare,
  LuRefreshCw,
  LuSearch,
  LuUser,
  LuX,
} from 'react-icons/lu';
import { useSearchParams } from 'react-router-dom';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { emitAppToast } from '../../lib/uiFeedback';
import {
  assistantMarkdownToPlainText,
  renderAssistantMessageContent,
} from '../messenger/assistantMessageFormat';
import {
  apiErrorMessage,
  fetchAssistantMonitorConversations,
  fetchAssistantMonitorMessages,
  type AssistantMonitorActivity,
  type AssistantMonitorConversation,
  type AssistantMonitorMessage,
  type AssistantMonitorSort,
} from './api';

const Q_LIST = ['admin', 'ai', 'monitor', 'conversations'] as const;
const Q_THREAD = ['admin', 'ai', 'monitor', 'messages'] as const;
const PAGE_SIZE = 60;

function prettyTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `вчера ${format(d, 'HH:mm')}`;
  return format(d, 'd MMM HH:mm', { locale: ru });
}

function prettyFullTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (isToday(d)) return 'Сегодня';
  if (isYesterday(d)) return 'Вчера';
  return format(d, 'd MMMM yyyy', { locale: ru });
}

function roleLabel(roles: string[] | null | undefined, fallback: string | null | undefined): string {
  const list = (roles && roles.length > 0 ? roles : fallback ? [fallback] : []).filter(Boolean);
  if (list.length === 0) return '';
  const map: Record<string, string> = {
    parishioner: 'прихожанин',
    member: 'член',
    minister: 'служитель',
    pastor: 'пастор',
    musician: 'музыкант',
    editor: 'редактор',
    admin: 'админ',
  };
  return list.map((r) => map[r] ?? r).join(', ');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

function isActiveToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && isToday(d);
}

async function copyText(text: string, okMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    emitAppToast(okMessage, 'success');
  } catch {
    emitAppToast('Не удалось скопировать', 'error');
  }
}

function messagePlainText(message: AssistantMonitorMessage): string {
  if (message.is_deleted) return '[удалено]';
  if (message.from === 'assistant') return assistantMarkdownToPlainText(message.content);
  return message.content || '';
}

function exportDialogText(
  conversation: AssistantMonitorConversation,
  messages: AssistantMonitorMessage[],
): string {
  const header = [
    `Диалог с ИИ помощником`,
    `Участник: ${conversation.owner_name}`,
    conversation.owner_phone ? `Телефон: ${conversation.owner_phone}` : null,
    `Роль: ${roleLabel(conversation.owner_app_roles, conversation.owner_app_role) || '—'}`,
    `Сообщений: ${conversation.message_count} (участник ${conversation.user_message_count} / ИИ ${conversation.assistant_message_count})`,
    `Экспорт: ${prettyFullTime(new Date().toISOString())}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  const body = messages
    .map((m) => {
      const who = m.from === 'assistant' ? 'ИИ помощник' : conversation.owner_name;
      return `[${prettyFullTime(m.created_at)}] ${who}:\n${messagePlainText(m)}`;
    })
    .join('\n\n');

  return `${header}\n\n${body}\n`;
}

function Avatar({
  name,
  url,
  size = 'md',
}: {
  name: string;
  url: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const src = resolvePublicUrl(url);
  const dim = size === 'lg' ? 'h-11 w-11 text-sm' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-xs';
  if (src) {
    return <img src={src} alt="" className={`${dim} shrink-0 rounded-full object-cover bg-stone-200`} />;
  }
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-stone-800 font-semibold text-white`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

function StatChip({
  label,
  value,
  hint,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const className = active
    ? 'rounded-xl border border-stone-900 bg-stone-900 px-3 py-2.5 text-left text-white shadow-sm'
    : interactive
      ? 'rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-left transition hover:border-stone-300 hover:bg-stone-50'
      : 'rounded-xl border border-stone-200/80 bg-white px-3 py-2.5 text-left';

  const inner = (
    <>
      <div className={`text-[11px] font-medium uppercase tracking-wide ${active ? 'text-stone-300' : 'text-stone-500'}`}>
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${active ? 'text-white' : 'text-stone-900'}`}>
        {value}
      </div>
      {hint ? (
        <div className={`mt-0.5 text-[11px] ${active ? 'text-stone-400' : 'text-stone-400'}`}>{hint}</div>
      ) : null}
    </>
  );

  if (interactive) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

function ConversationRow({
  item,
  active,
  onSelect,
}: {
  item: AssistantMonitorConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const hot = isActiveToday(item.last_message_at);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        active
          ? 'flex w-full gap-3 rounded-xl bg-stone-900 px-3 py-2.5 text-left text-white'
          : 'flex w-full gap-3 rounded-xl px-3 py-2.5 text-left text-stone-900 hover:bg-stone-100'
      }
    >
      <div className="relative shrink-0">
        <Avatar name={item.owner_name} url={item.owner_avatar_url} />
        {hot ? (
          <span
            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 ${
              active ? 'border-stone-900 bg-emerald-400' : 'border-white bg-emerald-500'
            }`}
            title="Активен сегодня"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-sm font-semibold ${active ? 'text-white' : 'text-stone-900'}`}>
            {item.owner_name}
          </span>
          <span className={`shrink-0 text-[11px] ${active ? 'text-stone-300' : 'text-stone-400'}`}>
            {prettyTime(item.last_message_at ?? item.updated_at)}
          </span>
        </div>
        <div className={`mt-0.5 truncate text-xs ${active ? 'text-stone-300' : 'text-stone-500'}`}>
          {item.last_message_from === 'assistant'
            ? 'ИИ: '
            : item.last_message_from === 'user'
              ? 'Участник: '
              : ''}
          {item.last_message_preview || 'Нет сообщений'}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
          <span className={active ? 'rounded bg-white/10 px-1.5 py-0.5 text-stone-300' : 'rounded bg-stone-100 px-1.5 py-0.5 text-stone-500'}>
            {item.user_message_count} → ИИ → {item.assistant_message_count}
          </span>
          {item.owner_phone ? (
            <span className={active ? 'rounded bg-white/10 px-1.5 py-0.5 text-stone-300' : 'rounded bg-stone-100 px-1.5 py-0.5 text-stone-500'}>
              {item.owner_phone}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({
  message,
  highlight,
}: {
  message: AssistantMonitorMessage;
  highlight?: boolean;
}) {
  const isBot = message.from === 'assistant';
  return (
    <div
      id={`ai-msg-${message.id}`}
      className={`flex gap-2 scroll-mt-4 ${isBot ? 'justify-start' : 'justify-end'} ${
        highlight ? 'rounded-2xl ring-2 ring-amber-400/70 ring-offset-2 ring-offset-stone-50' : ''
      }`}
    >
      {isBot ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <LuBot className="h-4 w-4" aria-hidden />
        </div>
      ) : null}
      <div
        className={
          isBot
            ? 'group relative max-w-[min(100%,36rem)] rounded-2xl rounded-tl-md border border-emerald-100 bg-emerald-50/80 px-3.5 py-2.5 text-sm text-stone-800'
            : 'group relative max-w-[min(100%,36rem)] rounded-2xl rounded-tr-md bg-stone-900 px-3.5 py-2.5 text-sm text-white'
        }
      >
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${isBot ? 'text-emerald-800/80' : 'text-stone-300'}`}>
          <span className="font-semibold">{isBot ? 'ИИ помощник' : message.sender_name || 'Пользователь'}</span>
          <span title={prettyFullTime(message.created_at)}>{prettyTime(message.created_at)}</span>
          {message.is_edited ? <span>· изменено</span> : null}
          <button
            type="button"
            className={`ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md opacity-0 transition group-hover:opacity-100 focus:opacity-100 ${
              isBot ? 'text-emerald-800/70 hover:bg-emerald-100' : 'text-stone-300 hover:bg-white/10'
            }`}
            title="Копировать сообщение"
            aria-label="Копировать сообщение"
            onClick={() => void copyText(messagePlainText(message), 'Сообщение скопировано')}
          >
            <LuCopy className="h-3.5 w-3.5" />
          </button>
        </div>
        {message.is_deleted ? (
          <p className={isBot ? 'italic text-stone-500' : 'italic text-stone-400'}>Сообщение удалено</p>
        ) : isBot ? (
          <div className="space-y-2 leading-relaxed">{renderAssistantMessageContent(message.content)}</div>
        ) : (
          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content || '—'}</p>
        )}
      </div>
      {!isBot ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-700">
          <LuUser className="h-4 w-4" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-stone-200" />
      <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-stone-500 shadow-sm">
        {label}
      </span>
      <div className="h-px flex-1 bg-stone-200" />
    </div>
  );
}

function ThreadPane({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [threadSearch, setThreadSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  const q = useInfiniteQuery({
    queryKey: [...Q_THREAD, conversationId],
    queryFn: ({ pageParam }) =>
      fetchAssistantMonitorMessages(conversationId, {
        limit: 80,
        before: pageParam ?? null,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => {
      if (!last.has_more || last.messages.length === 0) return undefined;
      return last.messages[0]!.id;
    },
  });

  const conversation = q.data?.pages[0]?.conversation;
  const messages = useMemo(() => {
    const pages = q.data?.pages ?? [];
    const ordered = [...pages].reverse().flatMap((p) => p.messages);
    const seen = new Set<string>();
    return ordered.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [q.data]);

  const needle = threadSearch.trim().toLowerCase();
  const matchIds = useMemo(() => {
    if (!needle) return [] as string[];
    return messages
      .filter((m) => !m.is_deleted && messagePlainText(m).toLowerCase().includes(needle))
      .map((m) => m.id);
  }, [messages, needle]);

  useEffect(() => {
    setMatchIndex(0);
  }, [needle, conversationId]);

  useEffect(() => {
    if (!needle || matchIds.length === 0) return;
    const id = matchIds[Math.min(matchIndex, matchIds.length - 1)];
    if (!id) return;
    document.getElementById(`ai-msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchIndex, matchIds, needle]);

  useEffect(() => {
    stickToBottom.current = true;
    setThreadSearch('');
    setSearchOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages.length, conversationId]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottom.current = nearBottom;
    setShowJump(!nearBottom);
    if (el.scrollTop < 80 && q.hasNextPage && !q.isFetchingNextPage) {
      const prevHeight = el.scrollHeight;
      void q.fetchNextPage().then(() => {
        requestAnimationFrame(() => {
          const next = scrollerRef.current;
          if (!next) return;
          next.scrollTop = next.scrollHeight - prevHeight + next.scrollTop;
        });
      });
    }
  };

  const jumpBottom = () => {
    stickToBottom.current = true;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    setShowJump(false);
  };

  let prevDayKey = '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-stone-200 px-3 py-2.5">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 md:hidden"
              aria-label="К списку чатов"
            >
              <LuArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          {conversation ? (
            <>
              <Avatar name={conversation.owner_name} url={conversation.owner_avatar_url} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-stone-900">{conversation.owner_name}</div>
                <div className="truncate text-xs text-stone-500">
                  {roleLabel(conversation.owner_app_roles, conversation.owner_app_role) || 'участник'}
                  {conversation.owner_phone ? ` · ${conversation.owner_phone}` : ''}
                  {` · ${conversation.user_message_count} отпр. / ${conversation.assistant_message_count} получ.`}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  title="Поиск в переписке"
                  aria-label="Поиск в переписке"
                  onClick={() => setSearchOpen((v) => !v)}
                >
                  <LuSearch className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  title="Скопировать весь диалог"
                  aria-label="Скопировать весь диалог"
                  onClick={() =>
                    void copyText(exportDialogText(conversation, messages), 'Диалог скопирован')
                  }
                >
                  <LuClipboardCopy className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <div className="text-sm text-stone-500">Загрузка…</div>
          )}
        </div>
        {searchOpen ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input
                autoFocus
                type="search"
                value={threadSearch}
                onChange={(e) => setThreadSearch(e.target.value)}
                placeholder="Найти в этом чате…"
                className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-stone-400 focus:bg-white"
              />
            </div>
            {needle ? (
              <div className="flex items-center gap-1 text-xs text-stone-500">
                <span className="tabular-nums">
                  {matchIds.length === 0 ? '0' : `${matchIndex + 1}/${matchIds.length}`}
                </span>
                <button
                  type="button"
                  className="rounded-lg border border-stone-200 px-2 py-1 disabled:opacity-40"
                  disabled={matchIds.length === 0}
                  onClick={() =>
                    setMatchIndex((i) => (matchIds.length === 0 ? 0 : (i - 1 + matchIds.length) % matchIds.length))
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-stone-200 px-2 py-1 disabled:opacity-40"
                  disabled={matchIds.length === 0}
                  onClick={() =>
                    setMatchIndex((i) => (matchIds.length === 0 ? 0 : (i + 1) % matchIds.length))
                  }
                >
                  ↓
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 text-stone-500"
              aria-label="Закрыть поиск"
              onClick={() => {
                setSearchOpen(false);
                setThreadSearch('');
              }}
            >
              <LuX className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="h-full space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] px-3 py-4"
        >
          {q.isFetchingNextPage ? (
            <div className="flex justify-center py-2 text-xs text-stone-400">
              <LuLoader className="mr-1 h-3.5 w-3.5 animate-spin" />
              Загрузка истории…
            </div>
          ) : null}
          {q.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-stone-500">
              <LuLoader className="mr-2 h-4 w-4 animate-spin" />
              Загрузка переписки…
            </div>
          ) : q.isError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {apiErrorMessage(q.error, 'Не удалось загрузить сообщения')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-stone-500">
              <LuMessagesSquare className="h-6 w-6 opacity-50" />
              В этом чате пока нет сообщений
            </div>
          ) : (
            messages.map((m) => {
              const dayKey = m.created_at.slice(0, 10);
              const showDay = dayKey !== prevDayKey;
              prevDayKey = dayKey;
              const highlight = needle.length > 0 && matchIds[matchIndex] === m.id;
              return (
                <div key={m.id} className="space-y-3">
                  {showDay ? <DaySeparator label={dayLabel(m.created_at)} /> : null}
                  <MessageBubble message={m} highlight={highlight} />
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {showJump ? (
          <button
            type="button"
            onClick={jumpBottom}
            className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-stone-800"
          >
            <LuArrowDown className="h-3.5 w-3.5" />
            К новым
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AiAssistantMonitorSection() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activity, setActivity] = useState<AssistantMonitorActivity>('all');
  const [sort, setSort] = useState<AssistantMonitorSort>('recent');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const fromUrl = searchParams.get('ai_chat');
    return fromUrl && /^\d+$/.test(fromUrl) ? fromUrl : null;
  });
  const [mobileOpened, setMobileOpened] = useState(() => Boolean(searchParams.get('ai_chat')));
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<AssistantMonitorConversation[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setOffset(0);
    setAccumulated([]);
  }, [debounced, activity, sort]);

  const listQ = useQuery({
    queryKey: [...Q_LIST, debounced, activity, sort, offset],
    queryFn: () =>
      fetchAssistantMonitorConversations({
        search: debounced || undefined,
        activity,
        sort,
        limit: PAGE_SIZE,
        offset,
      }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!listQ.data) return;
    setAccumulated((prev) => {
      if (offset === 0) return listQ.data.items;
      const seen = new Set(prev.map((i) => i.conversation_id));
      const merged = [...prev];
      for (const item of listQ.data.items) {
        if (!seen.has(item.conversation_id)) merged.push(item);
      }
      return merged;
    });
  }, [listQ.data, offset]);

  const items = accumulated;
  const stats = listQ.data?.stats;
  const total = listQ.data?.total ?? 0;
  const hasMore = items.length < total;

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedId) next.set('ai_chat', selectedId);
    else next.delete('ai_chat');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [selectedId, searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      if (mq.matches && !selectedId && items.length > 0) {
        setSelectedId(items[0]!.conversation_id);
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [items, selectedId]);

  useEffect(() => {
    if (selectedId && items.length > 0 && !items.some((i) => i.conversation_id === selectedId) && offset === 0) {
      // keep selection if still loading more; only reset when first page doesn't contain it and no search mismatch
      if (!debounced && activity === 'all') {
        setSelectedId(items[0]?.conversation_id ?? null);
        setMobileOpened(false);
      }
    }
  }, [items, selectedId, offset, debounced, activity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'j' && e.key !== 'k') return;
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.findIndex((i) => i.conversation_id === selectedId);
      const delta = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(items.length - 1, (idx < 0 ? 0 : idx) + delta));
      const next = items[nextIdx];
      if (!next) return;
      setSelectedId(next.conversation_id);
      setMobileOpened(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [items, selectedId]);

  const showThreadMobile = Boolean(selectedId) && mobileOpened;

  const toggleActivity = (next: AssistantMonitorActivity) => {
    setActivity((cur) => (cur === next ? 'all' : next));
  };

  const refresh = () => {
    setOffset(0);
    void qc.invalidateQueries({ queryKey: [...Q_LIST] });
    if (selectedId) void qc.invalidateQueries({ queryKey: [...Q_THREAD, selectedId] });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Мониторинг ИИ-помощника</h3>
            <p className="mt-1 max-w-2xl text-xs text-stone-500">
              Кто писал, сколько сообщений отправлено и получено, полная переписка. Только просмотр для
              администратора. Стрелки ↑↓ / j k — переключение чатов.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            <LuRefreshCw className={`h-3.5 w-3.5 ${listQ.isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
        {stats ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatChip
              label="Чатов"
              value={stats.conversation_count}
              active={activity === 'all'}
              onClick={() => setActivity('all')}
            />
            <StatChip label="Сообщений" value={stats.message_count} />
            <StatChip label="От пользователей" value={stats.user_message_count} hint="отправлено" />
            <StatChip label="От ИИ" value={stats.assistant_message_count} hint="получено" />
            <StatChip
              label="Активны сегодня"
              value={stats.active_today_count}
              hint="нажмите для фильтра"
              active={activity === 'today'}
              onClick={() => toggleActivity('today')}
            />
            <StatChip
              label="За 7 дней"
              value={stats.active_7d_count}
              hint="нажмите для фильтра"
              active={activity === '7d'}
              onClick={() => toggleActivity('7d')}
            />
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="grid min-h-[28rem] md:grid-cols-[minmax(17rem,24rem)_1fr] md:h-[min(72vh,42rem)]">
          <aside
            className={
              showThreadMobile
                ? 'hidden min-h-0 flex-col border-r border-stone-200 md:flex'
                : 'flex min-h-0 flex-col border-r border-stone-200'
            }
          >
            <div className="shrink-0 space-y-2 border-b border-stone-200 p-3">
              <label className="relative block">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Имя, телефон или id…"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as AssistantMonitorSort)}
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-2.5 py-2 text-xs text-stone-700 outline-none focus:border-stone-400"
                >
                  <option value="recent">Сначала недавние</option>
                  <option value="messages">Больше сообщений</option>
                  <option value="user_messages">Больше запросов к ИИ</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-stone-400">
                <span>
                  {listQ.isFetching && offset === 0 ? 'Обновление…' : `Показано ${items.length} из ${total}`}
                  {activity === 'today' ? ' · сегодня' : activity === '7d' ? ' · 7 дней' : ''}
                </span>
                {activity !== 'all' ? (
                  <button type="button" className="text-stone-600 underline-offset-2 hover:underline" onClick={() => setActivity('all')}>
                    сбросить фильтр
                  </button>
                ) : null}
              </div>
            </div>
            <div ref={listRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {listQ.isLoading && offset === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-stone-500">
                  <LuLoader className="mr-2 h-4 w-4 animate-spin" />
                  Загрузка чатов…
                </div>
              ) : listQ.isError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {apiErrorMessage(listQ.error, 'Не удалось загрузить диалоги')}
                </div>
              ) : items.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-stone-500">
                  <LuMessagesSquare className="h-6 w-6 opacity-40" />
                  {debounced || activity !== 'all' ? 'Ничего не найдено' : 'Диалогов с ИИ пока нет'}
                </div>
              ) : (
                <>
                  {items.map((item) => (
                    <ConversationRow
                      key={item.conversation_id}
                      item={item}
                      active={item.conversation_id === selectedId}
                      onSelect={() => {
                        setSelectedId(item.conversation_id);
                        setMobileOpened(true);
                      }}
                    />
                  ))}
                  {hasMore ? (
                    <button
                      type="button"
                      disabled={listQ.isFetching}
                      onClick={() => setOffset((o) => o + PAGE_SIZE)}
                      className="mt-1 w-full rounded-xl border border-stone-200 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                    >
                      {listQ.isFetching ? 'Загрузка…' : 'Показать ещё'}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </aside>

          <div
            className={
              showThreadMobile
                ? 'flex min-h-[24rem] min-w-0 flex-col md:min-h-0'
                : 'hidden min-h-0 min-w-0 flex-col md:flex'
            }
          >
            {selectedId ? (
              <ThreadPane conversationId={selectedId} onBack={() => setMobileOpened(false)} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-sm text-stone-500">
                <LuBot className="h-8 w-8 opacity-40" />
                Выберите чат слева, чтобы увидеть переписку
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
