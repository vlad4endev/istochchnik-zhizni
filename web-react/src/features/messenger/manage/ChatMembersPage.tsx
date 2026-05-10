import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { LuCrown, LuEllipsisVertical, LuMessageSquare, LuPlus, LuSearch, LuSettings2, LuShield, LuTrash2, LuUser, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { useAuthStore } from '../../auth/authStore';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { getAvatarColor } from '../avatarUtils';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { canAddParticipantsToGroup, canManageGroupMessenger, isAppAdministratorRole } from './messengerManageAccess';
import { ManageDialogShell } from './ManageDialogShell';
import { getAppScrollTop, setAppScrollTop } from '@/lib/appScroll';

/** Единый ключ для сравнения id участника (API может отдать number | string). */
function normalizeMemberId(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'bigint') return raw.toString();
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1) return null;
    return String(Math.trunc(raw));
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n) || n < 1) return null;
    return String(n);
  }
  return null;
}

export function ChatMembersPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const isAppAdministrator = useMemo(
    () => isAppAdministratorRole(authRole, authRoles),
    [authRole, authRoles],
  );
  const [members, setMembers] = useState<api.ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [permTarget, setPermTarget] = useState<api.ConversationMember | null>(null);
  const [memberMenu, setMemberMenu] = useState<api.ConversationMember | null>(null);
  const scrollKey = `messenger:chat-members:scroll:${chatId ?? 'unknown'}`;

  useEffect(() => {
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    const y = Number(saved);
    if (!Number.isFinite(y) || y < 0) return;
    requestAnimationFrame(() => setAppScrollTop(y, 'auto'));
  }, [scrollKey]);

  useEffect(() => {
    return () => {
      sessionStorage.setItem(scrollKey, String(getAppScrollTop() || 0));
    };
  }, [scrollKey]);

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
  const recentMembers = useMemo(
    () => [...members].sort((a, b) => Date.parse(b.joined_at) - Date.parse(a.joined_at)).slice(0, 5),
    [members],
  );

  const eff = meta?.my_effective_permissions;
  const canAddMembers = canAddParticipantsToGroup(eff, isAppAdministrator);
  const canManageMembers = canManageGroupMessenger(eff, isAppAdministrator);

  return (
    <ManageScreenShell
      trailing={
        canAddMembers ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm active:opacity-90"
          >
            <LuPlus className="h-4 w-4" aria-hidden />
            <span className="hidden min-[380px]:inline">Добавить</span>
          </button>
        ) : null
      }
    >
      <ManageSettingsGroup className="mt-4">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <LuSearch className="h-5 w-5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск участника…"
            className="min-h-[40px] w-full bg-transparent text-base text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
      </ManageSettingsGroup>

      <div className="mt-3">
        {loading ? (
          <ManageSettingsGroup className="p-4">
            <div className="space-y-2">
              <SkeletonBox width="100%" height="48px" radius="10px" />
              <SkeletonBox width="100%" height="48px" radius="10px" />
              <SkeletonBox width="100%" height="48px" radius="10px" />
            </div>
          </ManageSettingsGroup>
        ) : err ? (
          <p className="mt-2 text-sm font-medium text-red-600">{err}</p>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-[var(--text-secondary)]">Никого не нашли</p>
        ) : (
          <ManageSettingsGroup>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="flex w-full items-center gap-3 border-b border-stone-200/70 px-4 py-3 text-left dark:border-[var(--border)]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                <LuPlus size={18} />
              </span>
              <span className="text-base font-semibold text-primary">Добавить участника</span>
            </button>
            {recentMembers.length > 0 ? (
              <div className="flex items-center gap-2 border-b border-stone-200/70 px-4 py-3 dark:border-[var(--border)]">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">Недавно добавлены:</span>
                <div className="flex items-center">
                  {recentMembers.map((m) => {
                    const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
                    return (
                      <span
                        key={m.member_id}
                        className="-ml-1 first:ml-0 inline-block h-7 w-7 overflow-hidden rounded-full ring-2 ring-white dark:ring-[var(--bg-elevated)]"
                        title={displayName}
                      >
                        <AppAvatar
                          src={m.avatar_url ?? null}
                          fallback={displayName[0]?.toUpperCase() ?? 'U'}
                          className="grid h-full w-full place-items-center bg-primary/10 text-xs font-semibold text-primary"
                          imgClassName="h-full w-full object-cover"
                        />
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {filtered.map((m, i) => (
              <MemberRow
                key={m.member_id}
                m={m}
                isLast={i === filtered.length - 1}
                canEditPermissions={canManageMembers && m.role !== 'owner'}
                onEditPermissions={() => setPermTarget(m)}
                onOpenActions={() => setMemberMenu(m)}
                onOpenProfile={() => {
                  sessionStorage.setItem(scrollKey, String(getAppScrollTop() || 0));
                  navigate(`/profile/member-${m.member_id}`);
                }}
              />
            ))}
          </ManageSettingsGroup>
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

      {memberMenu && chatId
        ? createPortal(
            <MemberActionsMenu
              member={memberMenu}
              canManageMembers={canManageMembers}
              onClose={() => setMemberMenu(null)}
              onDirectMessage={async () => {
                try {
                  const created = await api.createPersonalChat(memberMenu.member_id);
                  navigate(`/messenger?conversationId=${encodeURIComponent(created.conversationId)}`);
                } catch {
                  setErr('Не удалось открыть личный чат');
                }
              }}
              onPromoteAdmin={async () => {
                try {
                  await api.patchConversationMember(chatId, memberMenu.member_id, { role: 'admin' });
                  const next = await api.fetchConversationMembers(chatId);
                  setMembers(next);
                } catch {
                  setErr('Не удалось назначить администратором');
                }
              }}
              onRemove={async () => {
                try {
                  await api.removeParticipant(chatId, memberMenu.member_id);
                  const next = await api.fetchConversationMembers(chatId);
                  setMembers(next);
                } catch {
                  setErr('Не удалось удалить участника');
                }
              }}
            />,
            document.body,
          )
        : null}
    </ManageScreenShell>
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
  isLast,
  canEditPermissions,
  onEditPermissions,
  onOpenActions,
  onOpenProfile,
}: {
  m: api.ConversationMember;
  isLast?: boolean;
  canEditPermissions: boolean;
  onEditPermissions: () => void;
  onOpenActions: () => void;
  onOpenProfile: () => void;
}) {
  const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
  const memberPresence = m.is_online ? 'в сети' : formatMessengerLastSeen(m.last_seen_at ?? null);
  const badge =
    m.role === 'owner'
      ? {
          text: 'Владелец',
          Icon: LuCrown,
          cls: 'bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-primary/15 dark:text-[var(--text)] dark:ring-[var(--border-hover)]',
        }
      : m.role === 'admin'
        ? {
            text: 'Админ',
            Icon: LuShield,
            cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70 dark:bg-primary/10 dark:text-primary dark:ring-primary/30',
          }
        : {
            text: 'Участник',
            Icon: LuUser,
            cls: 'bg-stone-50 text-stone-600 ring-stone-200/70 dark:bg-[var(--bg-interactive)] dark:text-[var(--text-secondary)] dark:ring-[var(--border)]',
          };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenProfile}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProfile();
        }
      }}
      className={[
        'flex cursor-pointer items-start gap-3 px-4 py-3 sm:gap-4',
        'transition-colors hover:bg-stone-50/80 active:bg-stone-100/70 dark:hover:bg-[var(--bg-hover)] dark:active:bg-[var(--bg-interactive)]',
        !isLast ? 'border-b border-stone-200/70 dark:border-[var(--border)]' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
        <AppAvatar
          src={m.avatar_url ?? null}
          fallback={displayName[0]?.toUpperCase() ?? 'U'}
          className="grid h-full w-full place-items-center"
          imgClassName="h-full w-full object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-[var(--text)]">{displayName}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{memberPresence}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenActions();
          }}
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface)]"
          aria-label="Действия"
        >
          <LuEllipsisVertical size={15} />
        </button>
        {canEditPermissions ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditPermissions();
            }}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]"
          >
            <LuSettings2 size={14} />
            Права
          </button>
        ) : null}
        <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${badge.cls}`}>
          <badge.Icon size={14} />
          {badge.text}
        </div>
      </div>
    </div>
  );
}

function MemberActionsMenu({
  member,
  canManageMembers,
  onClose,
  onDirectMessage,
  onPromoteAdmin,
  onRemove,
}: {
  member: api.ConversationMember;
  canManageMembers: boolean;
  onClose: () => void;
  onDirectMessage: () => void | Promise<void>;
  onPromoteAdmin: () => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}) {
  const displayName =
    (member.first_name ? `${member.first_name} ${member.last_name ?? ''}`.trim() : member.name) ||
    `Участник ${member.member_id}`;
  return (
    <ManageDialogShell
      onClose={onClose}
      zIndexClassName="z-[4200]"
      backdropClassName="bg-black/30 dark:bg-black/45"
      contentClassName="rounded-3xl p-4 dark:border-t"
    >
        <p className="mb-2 text-center text-sm font-semibold text-[var(--text-secondary)]">{displayName}</p>
        <button type="button" onClick={() => { void onDirectMessage(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface)]">
          <LuMessageSquare size={18} />
          <span className="text-base">Написать личное сообщение</span>
        </button>
        {canManageMembers ? (
          <button type="button" onClick={() => { void onPromoteAdmin(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-[var(--surface)]">
            <LuShield size={18} />
            <span className="text-base">Назначить администратором</span>
          </button>
        ) : null}
        {canManageMembers ? (
          <button type="button" onClick={() => { void onRemove(); onClose(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-red-600 hover:bg-red-50 dark:text-rose-300 dark:hover:bg-rose-500/10">
            <LuTrash2 size={18} />
            <span className="text-base">Удалить из группы</span>
          </button>
        ) : null}
    </ManageDialogShell>
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
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 ring-1 ring-stone-200/70 dark:ring-[var(--border)]">
      <span className="text-sm font-bold text-[var(--text)]">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-stone-300 text-primary"
        checked={p[k]}
        onChange={(e) => setP((prev) => ({ ...prev, [k]: e.target.checked }))}
      />
    </label>
  );

  return (
    <ManageDialogShell
      onClose={onClose}
      zIndexClassName="z-[4000]"
      align="center"
      contentClassName="max-h-[85dvh] max-w-md overflow-y-auto p-5"
    >
        <div className="flex items-center justify-between gap-2">
          <p className="text-lg font-extrabold text-[var(--text)]">Права участника</p>
          <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-[var(--surface)]" aria-label="Закрыть">
            <LuX />
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
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
            className="min-h-[48px] flex-1 rounded-2xl bg-[var(--surface)] py-3 text-sm font-extrabold text-[var(--text)]"
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
    </ManageDialogShell>
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
  const [busyKey, setBusyKey] = useState<string | null>(null);
  /** Актуальные id участников чата с сервера (источник истины при открытии диалога). */
  const [fetchedMemberKeys, setFetchedMemberKeys] = useState<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .fetchConversationMembers(chatId)
      .then((list) => {
        if (!alive) return;
        const next = new Set<string>();
        for (const row of list) {
          const k = normalizeMemberId(row.member_id);
          if (k) next.add(k);
        }
        setFetchedMemberKeys(next);
      })
      .catch(() => {
        if (!alive) return;
        setFetchedMemberKeys(null);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

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

  const propMemberKeys = useMemo(() => {
    const s = new Set<string>();
    for (const x of existingMemberIds) {
      const k = normalizeMemberId(x);
      if (k) s.add(k);
    }
    return s;
  }, [existingMemberIds]);

  const existing = useMemo(() => {
    const merged = new Set(propMemberKeys);
    if (fetchedMemberKeys) {
      for (const k of fetchedMemberKeys) merged.add(k);
    }
    return merged;
  }, [propMemberKeys, fetchedMemberKeys]);

  const dedupedResults = useMemo(() => {
    const seen = new Set<string>();
    const out: api.SearchMember[] = [];
    for (const m of results) {
      const k = normalizeMemberId(m.id);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out;
  }, [results]);

  /** Сначала тех, кого можно добавить, затем уже в чате (серые строки). */
  const orderedResults = useMemo(() => {
    const addable: api.SearchMember[] = [];
    const inChat: api.SearchMember[] = [];
    for (const m of dedupedResults) {
      const k = normalizeMemberId(m.id);
      if (k && existing.has(k)) inChat.push(m);
      else addable.push(m);
    }
    return [...addable, ...inChat];
  }, [dedupedResults, existing]);

  const title = 'Добавить участника';

  return (
    <ManageDialogShell
      onClose={onClose}
      zIndexClassName="z-[3000]"
      contentClassName="max-w-xl"
      backdropClassName="bg-black/30"
    >
        <div className="flex items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3 dark:border-[var(--border)]">
          <p className="text-sm font-extrabold text-[var(--text)]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface)]"
            aria-label="Закрыть"
          >
            <LuX />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3">
            <LuSearch className="text-[var(--text-muted)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Введите имя…"
              className="w-full bg-transparent text-base font-semibold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
              autoFocus
            />
          </div>
          <p className="mt-2 text-xs font-semibold leading-snug text-[var(--text-muted)]">
            В списке только пользователи с одобренной регистрацией. Уже в этом чате отображаются серым и не добавляются повторно.
          </p>

          {err ? <p className="mt-2 text-sm font-semibold text-red-600">{err}</p> : null}

          <div className="mt-3 max-h-[60dvh] overflow-y-auto">
            {loading ? (
              <div className="space-y-2">
                <SkeletonBox width="100%" height="56px" radius="16px" />
                <SkeletonBox width="100%" height="56px" radius="16px" />
                <SkeletonBox width="100%" height="56px" radius="16px" />
              </div>
            ) : orderedResults.length === 0 ? (
              <p className="py-6 text-center text-sm font-semibold text-[var(--text-secondary)]">
                {q.trim() ? 'Никого не нашли' : 'Нет пользователей с активной регистрацией или начните вводить имя'}
              </p>
            ) : (
              <div className="space-y-2">
                {orderedResults.map((m) => {
                  const idKey = normalizeMemberId(m.id);
                  const displayName =
                    (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) ||
                    `Участник ${m.id}`;
                  const isBusy = idKey != null && busyKey === idKey;
                  const alreadyInChat = idKey != null && existing.has(idKey);

                  if (alreadyInChat) {
                    return (
                      <div
                        key={idKey ?? m.id}
                        role="listitem"
                        aria-label={`${displayName}, уже в чате`}
                        className="pointer-events-none flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--surface)] px-4 py-3 text-left ring-1 ring-stone-200/60 dark:ring-[var(--border)]"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <div
                            className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-stone-200/80"
                            style={{ background: getAvatarColor(String(m.id)) }}
                          >
                            <AppAvatar
                              src={m.avatar_url ?? null}
                              fallback={displayName.trim().charAt(0) || '?'}
                              className="h-full w-full opacity-70"
                              imgClassName="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--text-muted)]">{displayName}</p>
                            <p className="mt-0.5 text-xs font-semibold text-[var(--text-muted)]">Уже в чате</p>
                          </div>
                        </div>
                        <span className="inline-flex shrink-0 rounded-full bg-stone-200/90 px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">
                          В чате
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={idKey ?? m.id}
                      type="button"
                      disabled={isBusy || idKey == null}
                      onClick={async () => {
                        if (idKey == null) return;
                        try {
                          setBusyKey(idKey);
                          setErr(null);
                          const memberIdNum = Number(idKey);
                          await api.addParticipant(chatId, memberIdNum);
                          await onAdded();
                          onClose();
                        } catch {
                          setErr('Не удалось добавить участника (нет прав или ошибка сервера)');
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--surface-elevated)] px-4 py-3 text-left shadow-sm ring-1 ring-stone-200/70 hover:bg-[var(--surface)] disabled:opacity-60 dark:ring-[var(--border)] dark:hover:bg-[var(--bg-hover)]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-stone-200/80"
                          style={{ background: getAvatarColor(String(m.id)) }}
                        >
                          <AppAvatar
                            src={m.avatar_url ?? null}
                            fallback={displayName.trim().charAt(0) || '?'}
                            className="h-full w-full"
                            imgClassName="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-extrabold text-[var(--text)]">{displayName}</p>
                          <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">ID: {m.id}</p>
                        </div>
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
    </ManageDialogShell>
  );
}

