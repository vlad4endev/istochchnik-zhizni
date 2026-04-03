import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuChevronRight, LuCrown, LuPlus, LuSearch, LuSettings2, LuShield, LuUser, LuX } from 'react-icons/lu';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import * as api from '../api/messengerApi';

export function ChatMembersPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<api.ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [permTarget, setPermTarget] = useState<api.ConversationMember | null>(null);

  useEffect(() => {
    if (!chatId) return;
    void api.fetchConversationMeta(chatId).then(setMeta).catch(() => setMeta(null));
  }, [chatId]);

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

  const canAddMembers = meta?.my_effective_permissions?.can_add_users === true;
  const canManageMembers = meta?.my_effective_permissions?.can_manage_chat === true;

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
              <MemberRow
                key={m.member_id}
                m={m}
                canEditPermissions={canManageMembers && m.role !== 'owner'}
                onEditPermissions={() => setPermTarget(m)}
              />
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

      {permTarget && chatId && meta ? (
        <MemberPermissionsDialog
          chatId={chatId}
          member={permTarget}
          chatMeta={meta}
          onClose={() => setPermTarget(null)}
          onSaved={async () => {
            const next = await api.fetchConversationMembers(chatId);
            setMembers(next);
            setPermTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

const PERM_DEFAULTS: Record<
  'can_send_messages' | 'can_send_media' | 'can_add_users' | 'can_pin_messages' | 'can_manage_chat',
  boolean
> = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: false,
  can_pin_messages: false,
  can_manage_chat: false,
};

function MemberRow({
  m,
  canEditPermissions,
  onEditPermissions,
}: {
  m: api.ConversationMember;
  canEditPermissions: boolean;
  onEditPermissions: () => void;
}) {
  const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
  const avatarSrc = resolvePublicUrl(m.avatar_url ?? null);
  const badge =
    m.role === 'owner' ? { text: 'Владелец', Icon: LuCrown, cls: 'bg-amber-50 text-amber-700 ring-amber-200/70' } :
    m.role === 'admin' ? { text: 'Админ', Icon: LuShield, cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70' } :
    { text: 'Участник', Icon: LuUser, cls: 'bg-stone-50 text-stone-600 ring-stone-200/70' };

  return (
    <div className="flex items-center gap-3 rounded-3xl bg-white/80 px-4 py-4 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur sm:gap-4 sm:px-5">
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-primary/10 text-primary font-extrabold">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          displayName[0]?.toUpperCase() ?? 'U'
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold text-stone-900">{displayName}</p>
        <p className="mt-0.5 text-xs font-semibold text-stone-500">ID: {m.member_id}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
        {canEditPermissions ? (
          <button
            type="button"
            onClick={onEditPermissions}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-3 py-1.5 text-[11px] font-extrabold text-stone-700 ring-1 ring-stone-200/80"
          >
            <LuSettings2 size={14} />
            Права
          </button>
        ) : null}
        <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${badge.cls}`}>
          <badge.Icon size={14} />
          {badge.text}
        </div>
      </div>
    </div>
  );
}

function MemberPermissionsDialog({
  chatId,
  member,
  chatMeta,
  onClose,
  onSaved,
}: {
  chatId: string;
  member: api.ConversationMember;
  chatMeta: api.ConversationMeta;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const base = { ...PERM_DEFAULTS, ...(chatMeta.default_permissions ?? {}) };
  const init = (k: keyof typeof PERM_DEFAULTS) =>
    member.permissions[k] !== undefined ? Boolean(member.permissions[k]) : Boolean(base[k]);

  const [p, setP] = useState(() => ({
    can_send_messages: init('can_send_messages'),
    can_send_media: init('can_send_media'),
    can_add_users: init('can_add_users'),
    can_pin_messages: init('can_pin_messages'),
    can_manage_chat: init('can_manage_chat'),
  }));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patchConversationMember(chatId, member.member_id, { permissions: p });
      await onSaved();
    } catch {
      alert('Не удалось сохранить права');
    } finally {
      setSaving(false);
    }
  };

  const Row = ({
    label,
    k,
  }: {
    label: string;
    k: keyof typeof p;
  }) => (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 ring-1 ring-stone-200/70">
      <span className="text-sm font-bold text-stone-800">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-stone-300 text-primary"
        checked={p[k]}
        onChange={(e) => setP((prev) => ({ ...prev, [k]: e.target.checked }))}
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[4000] flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-extrabold text-stone-900">Права участника</p>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-stone-100" aria-label="Закрыть">
            <LuX />
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-stone-500">
          Личные ограничения поверх настроек чата. Владелец и админы по роли сохраняют полные возможности.
        </p>
        <div className="mt-4 space-y-2">
          <Row k="can_send_messages" label="Отправка сообщений" />
          <Row k="can_send_media" label="Медиа и файлы" />
          <Row k="can_add_users" label="Добавлять участников" />
          <Row k="can_pin_messages" label="Закреплять сообщения" />
          <Row k="can_manage_chat" label="Управление чатом" />
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] flex-1 rounded-2xl bg-stone-100 py-3 text-sm font-extrabold text-stone-800"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="min-h-[48px] flex-1 rounded-2xl bg-primary py-3 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
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

