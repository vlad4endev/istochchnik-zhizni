import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuArrowLeft, LuBot, LuLoader, LuMessagesSquare, LuSearch, LuUser } from 'react-icons/lu';

import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { renderAssistantMessageContent } from '../messenger/assistantMessageFormat';
import {
  apiErrorMessage,
  fetchAssistantMonitorConversations,
  fetchAssistantMonitorMessages,
  type AssistantMonitorConversation,
  type AssistantMonitorMessage,
} from './api';

const Q_LIST = ['admin', 'ai', 'monitor', 'conversations'] as const;
const Q_THREAD = ['admin', 'ai', 'monitor', 'messages'] as const;

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
    return (
      <img
        src={src}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover bg-stone-200`}
      />
    );
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

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-stone-900">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-stone-400">{hint}</div> : null}
    </div>
  );
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
      <Avatar name={item.owner_name} url={item.owner_avatar_url} />
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
        <div className={`mt-1 flex flex-wrap gap-1.5 text-[10px] ${active ? 'text-stone-400' : 'text-stone-400'}`}>
          <span className={active ? 'rounded bg-white/10 px-1.5 py-0.5' : 'rounded bg-stone-100 px-1.5 py-0.5'}>
            {item.message_count} сообщ.
          </span>
          <span className={active ? 'rounded bg-white/10 px-1.5 py-0.5' : 'rounded bg-stone-100 px-1.5 py-0.5'}>
            ↑{item.user_message_count} / ↓{item.assistant_message_count}
          </span>
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: AssistantMonitorMessage }) {
  const isBot = message.from === 'assistant';
  return (
    <div className={`flex gap-2 ${isBot ? 'justify-start' : 'justify-end'}`}>
      {isBot ? (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <LuBot className="h-4 w-4" aria-hidden />
        </div>
      ) : null}
      <div
        className={
          isBot
            ? 'max-w-[min(100%,36rem)] rounded-2xl rounded-tl-md border border-emerald-100 bg-emerald-50/80 px-3.5 py-2.5 text-sm text-stone-800'
            : 'max-w-[min(100%,36rem)] rounded-2xl rounded-tr-md bg-stone-900 px-3.5 py-2.5 text-sm text-white'
        }
      >
        <div className={`mb-1 flex items-center gap-2 text-[11px] ${isBot ? 'text-emerald-800/80' : 'text-stone-300'}`}>
          <span className="font-semibold">
            {isBot ? 'ИИ помощник' : message.sender_name || 'Пользователь'}
          </span>
          <span title={prettyFullTime(message.created_at)}>{prettyTime(message.created_at)}</span>
          {message.is_edited ? <span>· изменено</span> : null}
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
    // pages: [newest page, older page, ...]; each page is chronological ASC
    // Infinite "next" loads older → prepend
    const ordered = [...pages].reverse().flatMap((p) => p.messages);
    const seen = new Set<string>();
    return ordered.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [q.data]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages.length, conversationId]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    stickToBottom.current = nearBottom;
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-200 px-3 py-2.5">
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
                {' · '}
                id {conversation.owner_member_id}
                {' · '}
                {conversation.user_message_count} отпр. / {conversation.assistant_message_count} получ.
              </div>
            </div>
          </>
        ) : (
          <div className="text-sm text-stone-500">Загрузка…</div>
        )}
      </header>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[linear-gradient(180deg,#fafaf9_0%,#f5f5f4_100%)] px-3 py-4"
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
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export function AiAssistantMonitorSection() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const listQ = useQuery({
    queryKey: [...Q_LIST, debounced],
    queryFn: () =>
      fetchAssistantMonitorConversations({
        search: debounced || undefined,
        limit: 80,
        offset: 0,
      }),
    refetchInterval: 30_000,
  });

  const items = listQ.data?.items ?? [];
  const stats = listQ.data?.stats;
  const total = listQ.data?.total ?? 0;
  /** На мобиле чат открывается только явным выбором; на десктопе — автовыбор первого. */
  const [mobileOpened, setMobileOpened] = useState(false);

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
    if (selectedId && items.length > 0 && !items.some((i) => i.conversation_id === selectedId)) {
      setSelectedId(items[0]?.conversation_id ?? null);
      setMobileOpened(false);
    }
  }, [items, selectedId]);

  const showThreadMobile = Boolean(selectedId) && mobileOpened;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Мониторинг ИИ-помощника</h3>
            <p className="mt-1 max-w-2xl text-xs text-stone-500">
              Полные диалоги участников с ИИ: кто писал, сколько сообщений отправлено и получено.
              Доступ только администратору. Переписка только для просмотра.
            </p>
          </div>
        </div>
        {stats ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Чатов" value={stats.conversation_count} />
            <StatCard label="Сообщений" value={stats.message_count} />
            <StatCard label="От пользователей" value={stats.user_message_count} hint="отправлено" />
            <StatCard label="От ИИ" value={stats.assistant_message_count} hint="получено" />
            <StatCard label="Активны сегодня" value={stats.active_today_count} />
            <StatCard label="За 7 дней" value={stats.active_7d_count} />
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="grid min-h-[28rem] md:grid-cols-[minmax(16rem,22rem)_1fr] md:h-[min(70vh,40rem)]">
          <aside
            className={
              showThreadMobile
                ? 'hidden min-h-0 flex-col border-r border-stone-200 md:flex'
                : 'flex min-h-0 flex-col border-r border-stone-200'
            }
          >
            <div className="shrink-0 border-b border-stone-200 p-3">
              <label className="relative block">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или id…"
                  className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-sm text-stone-900 outline-none placeholder:text-stone-400 focus:border-stone-400 focus:bg-white"
                />
              </label>
              <div className="mt-2 text-[11px] text-stone-400">
                {listQ.isFetching ? 'Обновление…' : `Найдено: ${total}`}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
              {listQ.isLoading ? (
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
                  Диалогов с ИИ пока нет
                </div>
              ) : (
                items.map((item) => (
                  <ConversationRow
                    key={item.conversation_id}
                    item={item}
                    active={item.conversation_id === selectedId}
                    onSelect={() => {
                      setSelectedId(item.conversation_id);
                      setMobileOpened(true);
                    }}
                  />
                ))
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
              <ThreadPane
                conversationId={selectedId}
                onBack={() => setMobileOpened(false)}
              />
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
