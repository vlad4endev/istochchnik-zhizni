import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuChevronRight, LuCrown, LuShield, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';

export function ChatAdminsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<api.ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
        setErr('Не удалось загрузить администраторов');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const owner = useMemo(() => members.find((m) => m.role === 'owner') ?? null, [members]);
  const admins = useMemo(() => members.filter((m) => m.role === 'admin'), [members]);

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
        <button
          type="button"
          onClick={() => navigate('/messenger')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
        >
          <LuX />
          Закрыть
        </button>
      </div>

      <div className="mt-6 rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200/70 backdrop-blur">
        <p className="text-lg font-extrabold text-stone-900">Администраторы</p>
        <p className="mt-1 text-sm font-semibold text-stone-500">
          Владелец всегда имеет полный доступ. Админам можно выдавать ограничения через персональные права.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? (
          <>
            <div className="h-16 animate-pulse rounded-3xl bg-stone-100" />
            <div className="h-16 animate-pulse rounded-3xl bg-stone-100" />
          </>
        ) : err ? (
          <p className="text-sm font-semibold text-red-600">{err}</p>
        ) : (
          <>
            {owner ? <RoleRow m={owner} kind="owner" /> : null}
            {admins.map((a) => (
              <RoleRow key={a.member_id} m={a} kind="admin" />
            ))}
            {owner == null && admins.length === 0 ? (
              <p className="mt-6 text-center text-sm font-semibold text-stone-500">Администраторов нет</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function RoleRow({ m, kind }: { m: api.ConversationMember; kind: 'owner' | 'admin' }) {
  const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
  const badge =
    kind === 'owner'
      ? { text: 'Владелец', Icon: LuCrown, cls: 'bg-amber-50 text-amber-700 ring-amber-200/70' }
      : { text: 'Админ', Icon: LuShield, cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70' };

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

