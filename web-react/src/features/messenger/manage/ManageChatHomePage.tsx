import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuChevronRight, LuShield, LuSettings2, LuUsers, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { useChatStore } from '../chatStore';

export function ManageChatHomePage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const me = useChatStore((s) => s.currentMemberId);
  const conversations = useChatStore((s) => s.conversations);
  const conv = useMemo(() => conversations.find((c) => c.id === chatId) ?? null, [conversations, chatId]);

  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void api
      .fetchConversationMeta(chatId)
      .then((m) => {
        if (!alive) return;
        setMeta(m);
      })
      .catch(() => {
        if (!alive) return;
        setErr('Не удалось загрузить настройки чата');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const title =
    conv?.type === 'private'
      ? (conv.other_member?.first_name ? `${conv.other_member.first_name} ${conv.other_member.last_name ?? ''}`.trim() : conv.other_member?.name) ??
        'Чат'
      : conv?.title ?? meta?.title ?? 'Чат';

  const subtitle = meta?.type === 'channel' ? 'Канал' : meta?.type === 'group' ? 'Группа' : 'Личный чат';

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

      <div className="mt-5 rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200/70 backdrop-blur">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LuUsers size={26} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-stone-900">{title}</p>
            <p className="mt-0.5 text-sm font-semibold text-stone-500">{subtitle}</p>
            {me ? <p className="mt-1 text-xs text-stone-400">Ваш ID: {me}</p> : null}
          </div>
        </div>

        {loading ? (
          <div className="mt-4 h-10 w-full animate-pulse rounded-2xl bg-stone-100" />
        ) : err ? (
          <p className="mt-4 text-sm font-semibold text-red-600">{err}</p>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <SectionCard
          title="Участники"
          description="Список, роли, управление"
          Icon={LuUsers}
          to={chatId ? `/messenger/chat/${chatId}/manage/members` : '/messenger'}
        />
        <SectionCard
          title="Администраторы"
          description="Назначение и ограничения"
          Icon={LuShield}
          to={chatId ? `/messenger/chat/${chatId}/manage/admins` : '/messenger'}
        />
        <SectionCard
          title="Разрешения"
          description="Кто может писать, медиа, приглашения"
          Icon={LuSettings2}
          to={chatId ? `/messenger/chat/${chatId}/manage/permissions` : '/messenger'}
        />
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  Icon,
  to,
}: {
  title: string;
  description: string;
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-[72px] items-center gap-4 rounded-3xl bg-white/80 px-5 py-4 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur transition hover:translate-y-[-1px] hover:shadow-[0_14px_40px_rgba(28,25,23,0.10)]"
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-600 transition group-hover:bg-primary/10 group-hover:text-primary">
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-extrabold text-stone-900">{title}</p>
        <p className="mt-0.5 text-sm font-semibold text-stone-500">{description}</p>
      </div>
      <LuChevronRight className="text-stone-400 transition group-hover:text-primary" />
    </Link>
  );
}

