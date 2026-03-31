import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuChevronRight, LuCrown, LuPlus, LuSearch, LuShield, LuUser, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { useChatStore } from '../chatStore';

export function ChatMembersPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const me = useChatStore((s) => s.currentMemberId);
  const [members, setMembers] = useState<api.ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void api
      .fetchConversationMembers(chatId)
      .then((m) => {
        if (!alive) return;
        setMembers(m);
      })
      .catch(() => {
        if (!alive) return;
        setErr('Не удалось загрузить участников');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return members;
    return members.filter((m) => {
      const name = `${m.first_name ?? ''} ${m.last_name ?? ''} ${m.name ?? ''}`.toLowerCase();
      return name.includes(term);
    });
  }, [members, q]);

  const myRole = useMemo(() => {
    if (!me) return null;
    const row = members.find((m) => Number(m.member_id) === Number(me));
    return row?.role ?? null;
  }, [members, me]);

  const canAddMembers = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
        >
          <LuChevronRight className="rotate-180" />
          Назад
        </button>
        <div className="flex items-center gap-2">
          {canAddMembers ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-extrabold text-white shadow-md shadow-primary/20 ring-1 ring-primary/30"
            >
              <LuPlus />
              Добавить
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate('/messenger')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
          >
            <LuX />
            Закрыть
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 rounded-3xl bg-white/80 px-4 py-3 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur">
        <LuSearch className="text-stone-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск участника…"
          className="w-full bg-transparent text-[15px] font-semibold text-stone-800 outline-none placeholder:text-stone-400"
        />
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-16 animate-pulse rounded-3xl bg-stone-100" />
            <div className="h-16 animate-pulse rounded-3xl bg-stone-100" />
            <div className="h-16 animate-pulse rounded-3xl bg-stone-100" />
          </div>
        ) : err ? (
          <p className="text-sm font-semibold text-red-600">{err}</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((m) => (
              <MemberRow key={m.member_id} m={m} />
            ))}
            {filtered.length === 0 ? (
              <p className="mt-6 text-center text-sm font-semibold text-stone-500">Никого не нашли</p>
            ) : null}
          </div>
        )}
      </div>

      {showAdd && chatId ? (
        <AddMemberDialog
          chatId={chatId}
          existingMemberIds={members.map((m) => m.member_id)}
          onClose={() => setShowAdd(false)}
          onAdded={async () => {
            const next = await api.fetchConversationMembers(chatId);
            setMembers(next);
          }}
        />
      ) : null}
    </div>
  );
}

function MemberRow({ m }: { m: api.ConversationMember }) {
  const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
  const badge =
    m.role === 'owner' ? { text: 'Владелец', Icon: LuCrown, cls: 'bg-amber-50 text-amber-700 ring-amber-200/70' } :
    m.role === 'admin' ? { text: 'Админ', Icon: LuShield, cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70' } :
    { text: 'Участник', Icon: LuUser, cls: 'bg-stone-50 text-stone-600 ring-stone-200/70' };

  return (
    <div className="flex items-center gap-4 rounded-3xl bg-white/80 px-5 py-4 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary font-extrabold">
        {displayName[0]?.toUpperCase() ?? 'U'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold text-stone-900">{displayName}</p>
        <p className="mt-0.5 text-xs font-semibold text-stone-500">ID: {m.member_id}</p>
      </div>
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${badge.cls}`}>
        <badge.Icon size={14} />
        {badge.text}
      </div>
    </div>
  );
}

function AddMemberDialog({
  chatId,
  existingMemberIds,
  onClose,
  onAdded,
}: {
  chatId: string;
  existingMemberIds: number[];
  onClose: () => void;
  onAdded: () => void | Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<api.SearchMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    void api
      .searchMembers(q.trim())
      .then((r) => {
        if (!alive) return;
        setResults(r);
      })
      .catch(() => {
        if (!alive) return;
        setErr('Не удалось выполнить поиск');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [q]);

  const existing = useMemo(() => new Set(existingMemberIds.map((x) => Number(x))), [existingMemberIds]);
  const filtered = useMemo(() => results.filter((m) => !existing.has(Number(m.id))), [results, existing]);

  const title = 'Добавить участника';

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-black/30 p-3">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-extrabold text-stone-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100"
            aria-label="Закрыть"
          >
            <LuX />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-3 rounded-2xl bg-stone-100 px-4 py-3">
            <LuSearch className="text-stone-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Введите имя…"
              className="w-full bg-transparent text-[15px] font-semibold text-stone-800 outline-none placeholder:text-stone-400"
              autoFocus
            />
          </div>

          {err ? <p className="mt-2 text-sm font-semibold text-red-600">{err}</p> : null}

          <div className="mt-3 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">
                <div className="h-14 animate-pulse rounded-2xl bg-stone-100" />
                <div className="h-14 animate-pulse rounded-2xl bg-stone-100" />
                <div className="h-14 animate-pulse rounded-2xl bg-stone-100" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm font-semibold text-stone-500">
                {q.trim() ? 'Никого не нашли' : 'Начните вводить имя для поиска'}
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((m) => {
                  const displayName =
                    (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) ||
                    `Участник ${m.id}`;
                  const isBusy = busyId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        try {
                          setBusyId(m.id);
                          setErr(null);
                          await api.addParticipant(chatId, m.id);
                          await onAdded();
                          onClose();
                        } catch {
                          setErr('Не удалось добавить участника (нет прав или ошибка сервера)');
                        } finally {
                          setBusyId(null);
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-stone-200/70 hover:bg-stone-50 disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-stone-900">{displayName}</p>
                        <p className="mt-0.5 text-xs font-semibold text-stone-500">ID: {m.id}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-extrabold text-primary">
                        <LuPlus size={14} />
                        Добавить
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

