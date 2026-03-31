import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuCake, LuChevronRight, LuPhone, LuShield, LuSettings2, LuUsers, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { useChatStore } from '../chatStore';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  }
  return 'Произошла ошибка';
}

export function ManageChatHomePage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const me = useChatStore((s) => s.currentMemberId);
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const conversations = useChatStore((s) => s.conversations);
  const conv = useMemo(() => conversations.find((c) => c.id === chatId) ?? null, [conversations, chatId]);

  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [privateProfile, setPrivateProfile] = useState<api.PrivateChatProfile | null>(null);
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
      .catch((e) => {
        if (!alive) return;
        setErr(`Не удалось загрузить настройки чата: ${axiosMessage(e)}`);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    const isPrivate = conv?.type === 'private';
    if (!isPrivate) {
      setPrivateProfile(null);
      return;
    }
    let alive = true;
    void api
      .fetchPrivateChatProfile(chatId)
      .then((p) => {
        if (!alive) return;
        setPrivateProfile(p);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(`Не удалось загрузить профиль: ${axiosMessage(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [chatId, conv?.type]);

  const title =
    conv?.type === 'private'
      ? (conv.other_member?.first_name ? `${conv.other_member.first_name} ${conv.other_member.last_name ?? ''}`.trim() : conv.other_member?.name) ??
        'Чат'
      : conv?.title ?? meta?.title ?? 'Чат';

  const subtitle = meta?.type === 'channel' ? 'Канал' : meta?.type === 'group' ? 'Группа' : 'Личный чат';
  const isPrivate = conv?.type === 'private';
  const isOnline = privateProfile ? onlineMembers.has(privateProfile.id) : false;
  const statusText = isOnline ? 'в сети' : 'был(а) недавно';
  const fullName = privateProfile
    ? [privateProfile.first_name, privateProfile.last_name].filter(Boolean).join(' ').trim() || privateProfile.name
    : null;
  const privateAvatarUrl =
    resolvePublicUrl(privateProfile?.avatar_url ?? null) ??
    resolvePublicUrl(conv?.other_member?.avatar_url ?? null);

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

      {isPrivate ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-3xl bg-primary/10 ring-1 ring-stone-200/70">
                {privateAvatarUrl ? (
                  <img src={privateAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xl font-extrabold text-primary">
                    {(fullName ?? title).trim().charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                <span
                  className={[
                    'absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-full border-2',
                    isOnline ? 'bg-emerald-500 border-white' : 'bg-stone-300 border-white',
                  ].join(' ')}
                  aria-hidden
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-extrabold text-stone-900">{fullName ?? title}</p>
                <p className="mt-0.5 text-xs font-semibold text-stone-500">{privateProfile ? statusText : '—'}</p>
                {privateProfile?.phone_number ? (
                  <p className="mt-1 text-sm font-semibold text-stone-700">{privateProfile.phone_number}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <InfoRow
                Icon={LuPhone}
                label="Телефон"
                value={privateProfile?.phone_number ?? '—'}
              />
              <InfoRow
                label="Роль в проекте"
                value={privateProfile?.app_role ?? '—'}
              />
              <InfoRow
                label="Роль (служение)"
                value={privateProfile?.ministry_role ?? '—'}
              />
              <InfoRow
                label="Направление"
                value={privateProfile?.ministry_direction ?? '—'}
              />
              <InfoRow
                Icon={LuCake}
                label="Дата рождения"
                value={privateProfile?.birth_date ?? '—'}
              />
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}

function InfoRow({
  Icon,
  label,
  value,
}: {
  Icon?: (p: { size?: number; className?: string }) => React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-stone-200/60">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="grid h-7 w-7 place-items-center rounded-xl bg-stone-100 text-stone-700">
              <Icon size={16} />
            </span>
          ) : null}
          <p className="text-sm font-extrabold text-stone-900">{label}</p>
        </div>
      </div>
      <p className="max-w-[60%] text-right text-sm font-semibold text-stone-600">{value}</p>
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

