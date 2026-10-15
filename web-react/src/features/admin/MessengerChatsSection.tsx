import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LuHash, LuMessageCircle, LuSearch, LuTrash2, LuUsers } from 'react-icons/lu';

import { apiErrorMessage } from './api';
import {
  deleteAdminMessengerChat,
  fetchAdminMessengerChats,
  purgeEmptyAdminMessengerChats,
  type AdminChatFilter,
  type AdminChatListItem,
  type AdminChatSummary,
} from './messengerChatsApi';

const QK = ['admin', 'messenger-chats'] as const;
const PAGE = 40;

const FILTERS: { id: AdminChatFilter; label: string }[] = [
  { id: 'rooms', label: 'Группы и каналы' },
  { id: 'active', label: 'Рабочие' },
  { id: 'group', label: 'Группы' },
  { id: 'channel', label: 'Каналы' },
  { id: 'private', label: 'Личные' },
  { id: 'empty', label: 'Пустые' },
  { id: 'all', label: 'Все' },
];

function plural(n: number, one: string, few: string, many: string): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

function activityLabel(item: AdminChatListItem): string {
  const count = `${item.message_count} ${plural(item.message_count, 'сообщение', 'сообщения', 'сообщений')}`;
  if (!item.last_message_at) return item.message_count > 0 ? count : 'нет сообщений';
  const diff = Date.now() - new Date(item.last_message_at).getTime();
  const mins = Math.max(0, Math.round(diff / 60000));
  let when = new Date(item.last_message_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  if (mins < 2) when = 'только что';
  else if (mins < 60) when = `${mins} мин назад`;
  else if (mins < 60 * 24) when = `${Math.round(mins / 60)} ч назад`;
  else if (mins < 60 * 24 * 7) when = `${Math.round(mins / (60 * 24))} дн назад`;
  return `${when} · ${count}`;
}

function typeLabel(item: AdminChatListItem): string {
  if (item.kind === 'assistant') return 'ИИ';
  if (item.kind === 'access_requests') return 'Заявки';
  if (item.kind === 'media_team') return 'Медийка';
  if (item.kind === 'service_plan_planning') return 'Богослужение';
  if (item.studio_song_id) return 'Обсуждение песни';
  if (item.type === 'channel') return 'Канал';
  if (item.type === 'group') return 'Группа';
  return 'Личный';
}

function statusLabel(item: AdminChatListItem): { text: string; className: string } {
  if (item.is_system) {
    return {
      text: 'служебный',
      className: 'bg-sky-50 text-sky-800 ring-sky-100',
    };
  }
  if (item.is_active) {
    return {
      text: 'рабочая',
      className: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
    };
  }
  return {
    text: 'пустая',
    className: 'bg-amber-50 text-amber-900 ring-amber-100',
  };
}

function chatAccent(item: AdminChatListItem): string {
  if (item.is_system) return 'border-l-sky-400';
  if (item.is_active) return 'border-l-emerald-500';
  return 'border-l-amber-400';
}

function chatMark(item: AdminChatListItem): { className: string } {
  if (item.kind === 'assistant' || item.is_system) return { className: 'bg-sky-100 text-sky-800' };
  if (item.type === 'channel') return { className: 'bg-violet-100 text-violet-800' };
  if (item.type === 'group') return { className: 'bg-primary/10 text-primary' };
  return { className: 'bg-stone-100 text-stone-600' };
}

function filterCount(id: AdminChatFilter, summary: AdminChatSummary): number | null {
  if (id === 'active') return summary.active_rooms;
  if (id === 'group') return summary.groups;
  if (id === 'channel') return summary.channels;
  if (id === 'private') return summary.private;
  if (id === 'empty') return summary.empty;
  return null;
}

function deletePrompt(item: AdminChatListItem): string {
  const name = `«${item.display_title}»`;
  if (item.kind === 'assistant') {
    return `Удалить служебный канал ${name} из базы? У участника пропадёт ИИ-помощник. Это нельзя отменить.`;
  }
  if (item.is_system) {
    return `Удалить служебный канал ${name} из базы?\nПриложение может создать его снова, когда канал понадобится. Переписка внутри сотрётся.`;
  }
  if (item.is_active) {
    const members = `${item.active_member_count} ${plural(item.active_member_count, 'участник', 'участника', 'участников')}`;
    return `Удалить ${name} из базы?\nСейчас в чате ${members}. Переписка сотрётся у всех, восстановить будет нельзя.`;
  }
  return `Удалить пустой чат ${name} из базы? Запись и сообщения исчезнут полностью.`;
}

function membersLabel(item: AdminChatListItem): string {
  const active = item.is_active
    ? `${item.active_member_count} ${plural(item.active_member_count, 'участник', 'участника', 'участников')}`
    : 'нет участников';
  if (item.left_member_count > 0) return `${active} · ${item.left_member_count} вышли`;
  return active;
}

export function MessengerChatsSection() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<AdminChatFilter>('rooms');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setLimit(PAGE);
  }, [filter, search]);

  const listQ = useQuery({
    queryKey: [...QK, filter, search, limit],
    queryFn: () => fetchAdminMessengerChats({ filter, q: search, limit, offset: 0 }),
  });

  const summary: AdminChatSummary = listQ.data?.summary ?? {
    groups: 0,
    channels: 0,
    private: 0,
    active_rooms: 0,
    empty: 0,
    assistant: 0,
  };
  const items = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: [...QK] });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAdminMessengerChat(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Чат удалён из базы.' });
      void invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить чат') }),
  });

  const purgeMut = useMutation({
    mutationFn: () => purgeEmptyAdminMessengerChats(),
    onSuccess: (deleted) => {
      setNote({
        type: 'ok',
        text: deleted > 0 ? `Из базы удалено пустых чатов: ${deleted}.` : 'Пустых чатов не осталось.',
      });
      void invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить пустые чаты') }),
  });

  const busy = deleteMut.isPending || purgeMut.isPending;

  const askDelete = (item: AdminChatListItem) => {
    if (!window.confirm(deletePrompt(item))) return;
    deleteMut.mutate(item.id);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 snap-x snap-mandatory [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
        <StatCard label="Рабочие" value={summary.active_rooms} hint="есть участники" />
        <StatCard label="Группы" value={summary.groups} hint="всего в базе" />
        <StatCard label="Каналы" value={summary.channels} hint="без служебного ИИ" />
        <StatCard
          label="Пустые"
          value={summary.empty}
          hint="можно стереть"
          tone={summary.empty > 0 ? 'warn' : 'ok'}
        />
      </div>

      <div className="rounded-2xl border border-stone-200/90 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Поиск чата</span>
            <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Название, создатель или участник"
              enterKeyHint="search"
              className="min-h-11 w-full rounded-xl border border-stone-200 bg-stone-50 py-2.5 pl-9 pr-3 text-base text-stone-900 outline-none touch-manipulation focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 sm:text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || summary.empty === 0}
            onClick={() => {
              if (summary.empty === 0) return;
              const ok = window.confirm(
                `Удалить из базы все пустые чаты (${summary.empty})?\nРабочие группы с участниками остаются. Служебные каналы (заявки, медийка, богослужение, ИИ) тоже не трогаются.`,
              );
              if (!ok) return;
              purgeMut.mutate();
            }}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 touch-manipulation disabled:opacity-50 sm:w-auto sm:shrink-0"
          >
            <LuTrash2 className="h-4 w-4" />
            Удалить пустые
            {summary.empty > 0 ? <span className="tabular-nums">({summary.empty})</span> : null}
          </button>
        </div>

        <div className="-mx-3 mt-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 snap-x snap-mandatory [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            const count = filterCount(item.id, summary);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={
                  active
                    ? 'inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full bg-stone-900 px-3.5 text-xs font-semibold text-white touch-manipulation'
                    : 'inline-flex min-h-10 shrink-0 snap-start items-center gap-1.5 rounded-full bg-stone-100 px-3.5 text-xs font-semibold text-stone-600 touch-manipulation hover:bg-stone-200'
                }
              >
                {item.label}
                {count != null ? (
                  <span className={active ? 'tabular-nums text-white/70' : 'tabular-nums text-stone-400'}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {note ? (
        <p
          className={
            note.type === 'ok'
              ? 'rounded-xl bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800'
              : 'rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700'
          }
        >
          {note.text}
        </p>
      ) : null}

      {listQ.isLoading ? (
        <ul className="space-y-2" aria-busy="true" aria-label="Загружаем чаты">
          {[0, 1, 2].map((n) => (
            <li key={n} className="h-[7.5rem] animate-pulse rounded-2xl border border-stone-200/80 bg-stone-100/80" />
          ))}
        </ul>
      ) : listQ.isError ? (
        <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
          {apiErrorMessage(listQ.error, 'Не удалось загрузить чаты')}
        </p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-12 text-center">
          <p className="text-sm font-medium text-stone-700">В этом разделе чатов нет</p>
          <p className="mt-1 text-xs text-stone-500">Смените фильтр или запрос поиска.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const status = statusLabel(item);
            const mark = chatMark(item);
            const MarkIcon = item.type === 'channel' ? LuHash : item.type === 'group' ? LuUsers : LuMessageCircle;
            return (
              <li
                key={item.id}
                className={`overflow-hidden rounded-2xl border border-stone-200/90 border-l-[3px] bg-white shadow-sm ${chatAccent(item)}`}
              >
                <div className="flex items-start gap-3 p-3 sm:p-4">
                  <span
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${mark.className}`}
                    aria-hidden
                  >
                    <MarkIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-stone-900">
                        {item.display_title}
                      </h3>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askDelete(item)}
                        className="hidden min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:inline-flex"
                      >
                        <LuTrash2 className="h-3.5 w-3.5" />
                        Удалить
                      </button>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        {typeLabel(item)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${status.className}`}>
                        {status.text}
                      </span>
                    </div>
                    <div className="mt-2.5 space-y-1 text-xs leading-relaxed text-stone-500">
                      <p className="font-medium text-stone-700">{membersLabel(item)}</p>
                      <p>{activityLabel(item)}</p>
                      {item.owner_label ? <p>создатель {item.owner_label}</p> : null}
                    </div>
                  </div>
                </div>
                <div className="border-t border-stone-100 px-3 py-2 sm:hidden">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => askDelete(item)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50/70 text-sm font-semibold text-red-700 touch-manipulation hover:bg-red-50 disabled:opacity-50"
                  >
                    <LuTrash2 className="h-4 w-4" />
                    Удалить из базы
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length < total ? (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="min-h-11 w-full rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-700 touch-manipulation hover:bg-stone-50"
        >
          Показать ещё · {items.length} из {total}
        </button>
      ) : total > 0 ? (
        <p className="text-center text-xs text-stone-400">
          {total} {plural(total, 'чат', 'чата', 'чатов')}
          {summary.private > 0 && filter === 'rooms' ? ` · личных в базе: ${summary.private}` : ''}
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  hint: string;
  tone?: 'neutral' | 'warn' | 'ok';
}) {
  const valueClass =
    tone === 'warn' ? 'text-amber-800' : tone === 'ok' ? 'text-emerald-700' : 'text-stone-900';
  return (
    <div className="w-[9.5rem] shrink-0 snap-start rounded-2xl border border-stone-200/90 bg-white px-3 py-3 shadow-sm sm:w-auto">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums leading-none ${valueClass}`}>{value}</p>
      <p className="mt-1.5 text-xs text-stone-500">{hint}</p>
    </div>
  );
}
