import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  LuCake,
  LuChevronRight,
  LuImagePlus,
  LuLock,
  LuPhone,
  LuPencil,
  LuShield,
  LuSettings2,
  LuUsers,
} from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import { useChatStore } from '../chatStore';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useAuthStore } from '../../auth/authStore';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { AppAvatar } from '../../../components/AppAvatar';
import { getAvatarInitial } from '../avatarUtils';
import { canManageGroupMessenger, isAppAdministratorRole } from './messengerManageAccess';

function GroupManageControls({
  chatId,
  initialTitle,
  onSaved,
}: {
  chatId: string;
  initialTitle: string;
  onSaved: () => Promise<void> | void;
}) {
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftTitle(initialTitle);
  }, [initialTitle]);

  const saveTitle = async () => {
    const t = draftTitle.trim();
    if (!t) return;
    setSaving(true);
    try {
      await api.updateConversation(chatId, { title: t });
      await onSaved();
      emitAppToast('Название сохранено', 'success');
    } catch {
      emitAppToast('Не удалось сохранить название', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onPickPhoto = async (file: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const toSend = await compressImageForMessengerUpload(file);
      const up = await api.uploadFile(toSend);
      await api.updateConversation(chatId, { avatar_url: up.url });
      useChatStore.getState().handleConvUpdated(chatId, { avatar_url: up.url });
      await onSaved();
      emitAppToast('Фото чата обновлено', 'success');
    } catch {
      emitAppToast('Не удалось загрузить фото', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const titleChanged = draftTitle.trim() !== (initialTitle || '').trim();

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-primary/15 bg-gradient-to-b from-white to-stone-50/80 p-4 shadow-sm ring-1 ring-stone-200/60 sm:p-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
      />
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary/90">Оформление</p>
        <p className="mt-1 text-[13px] leading-snug text-stone-600">Аватар и название видят все участники.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-stone-800 shadow-sm ring-1 ring-stone-200/90 transition hover:bg-stone-50 active:scale-[0.99] disabled:opacity-50"
        >
          <LuImagePlus size={18} className="text-primary" aria-hidden />
          {uploading ? 'Загрузка…' : 'Сменить фото'}
        </button>
      </div>
      <div className="space-y-2">
        <label className="block text-[12px] font-bold text-stone-500" htmlFor="group-chat-title-input">
          Название
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <input
            id="group-chat-title-input"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Название группы или канала"
            maxLength={120}
            className="min-h-[48px] min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-[16px] font-semibold text-stone-900 shadow-inner outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => void saveTitle()}
            disabled={saving || !titleChanged || !draftTitle.trim()}
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-[15px] font-extrabold text-white shadow-md transition hover:opacity-95 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40"
          >
            <LuPencil size={18} aria-hidden />
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  }
  return 'Произошла ошибка';
}

export function ManageChatHomePage() {
  const { chatId } = useParams<{ chatId: string }>();
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const isAppAdministrator = useMemo(
    () => isAppAdministratorRole(authRole, authRoles),
    [authRole, authRoles],
  );
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const memberLastSeenAt = useChatStore((s) => s.memberLastSeenAt);
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
  const canEditGroupAppearance =
    !isPrivate && canManageGroupMessenger(meta?.my_effective_permissions, isAppAdministrator);
  const groupAvatarSrc =
    resolvePublicUrl(conv?.avatar_url ?? meta?.avatar_url ?? null) ?? null;
  const isOnline = privateProfile ? onlineMembers.has(privateProfile.id) : false;
  const statusText = isOnline
    ? 'в сети'
    : formatMessengerLastSeen(
        privateProfile
          ? memberLastSeenAt[privateProfile.id] ?? privateProfile.last_seen_at
          : null,
      );
  const fullName = privateProfile
    ? [privateProfile.first_name, privateProfile.last_name].filter(Boolean).join(' ').trim() || privateProfile.name
    : null;
  const privateAvatarUrl =
    resolvePublicUrl(privateProfile?.avatar_url ?? null) ??
    resolvePublicUrl(conv?.other_member?.avatar_url ?? null);
  const privateInitial = getAvatarInitial(fullName ?? title, 'U');

  return (
    <ManageScreenShell>
      {!isPrivate ? (
        <ManageSettingsGroup className="mt-4 overflow-hidden">
          <div className="flex items-start gap-4 p-4 sm:gap-5 sm:p-5">
            <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 shadow-md ring-2 ring-white">
              <AppAvatar
                src={groupAvatarSrc}
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                fallback={
                  <div className="grid h-full w-full place-items-center text-primary">
                    <LuUsers size={28} />
                  </div>
                }
              />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="truncate text-[18px] font-bold tracking-tight text-gray-900">{title}</p>
              <p className="mt-1 inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-[12px] font-semibold text-stone-600">
                {subtitle}
              </p>
              {canEditGroupAppearance && chatId ? (
                <GroupManageControls
                  chatId={chatId}
                  initialTitle={meta?.title ?? conv?.title ?? ''}
                  onSaved={async () => {
                    void useChatStore.getState().loadConversations({ force: true });
                    try {
                      const m = await api.fetchConversationMeta(chatId, { bypassCache: true });
                      setMeta(m);
                    } catch {
                      /* ignore */
                    }
                  }}
                />
              ) : !loading && !err ? (
                <div
                  className="mt-4 flex gap-3 rounded-2xl border border-amber-200/90 bg-amber-50/95 p-4 shadow-sm"
                  role="status"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
                    <LuLock size={20} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold leading-snug text-amber-950">Редактирование недоступно</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-amber-900/85">
                      Менять название, фото и настройки могут только{' '}
                      <strong className="font-semibold text-amber-950">администраторы приложения</strong> или участники с
                      включённым правом <strong className="font-semibold text-amber-950">«Управление чатом»</strong> в
                      списке участников. У новых участников это право по умолчанию выключено — его может включить владелец
                      или админ чата.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="border-t border-gray-200/70 p-4">
              <div className="h-10 w-full animate-pulse rounded-lg bg-gray-100" />
            </div>
          ) : err ? (
            <div className="border-t border-gray-200/70 p-4">
              <p className="text-sm font-medium text-red-600">{err}</p>
            </div>
          ) : null}
        </ManageSettingsGroup>
      ) : null}

      {isPrivate ? (
        <div className="mt-4 space-y-3">
          <ManageSettingsGroup>
            <div className="flex flex-col items-center px-5 pb-4 pt-6">
              <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-full bg-primary/10 ring-2 ring-white shadow-sm">
                <AppAvatar
                  src={privateAvatarUrl}
                  className="h-full w-full"
                  imgClassName="h-full w-full object-cover"
                  fallback={
                    <div className="grid h-full w-full place-items-center text-2xl font-semibold text-primary">
                      {privateInitial}
                    </div>
                  }
                />
                <span
                  className={[
                    'absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white',
                    isOnline ? 'bg-emerald-500' : 'bg-gray-300',
                  ].join(' ')}
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-center text-[17px] font-semibold text-gray-900">{fullName ?? title}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <span className="text-[13px] text-blue-500">{privateProfile ? statusText : '—'}</span>
                {privateProfile?.app_role ? (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{privateProfile.app_role}</span>
                ) : null}
              </div>
            </div>
          </ManageSettingsGroup>

          <ManageSettingsGroup>
            <InfoRow Icon={LuPhone} label="Телефон" value={privateProfile?.phone_number ?? '—'} isFirst />
            <InfoRow label="Роль в проекте" value={privateProfile?.app_role ?? '—'} />
            <InfoRow label="Роль (служение)" value={privateProfile?.ministry_role ?? '—'} />
            <InfoRow label="Направление" value={privateProfile?.ministry_direction ?? '—'} />
            <InfoRow Icon={LuCake} label="Дата рождения" value={privateProfile?.birth_date ?? '—'} />
          </ManageSettingsGroup>
        </div>
      ) : (
        <ManageSettingsGroup className="mt-4">
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
            isLast
          />
        </ManageSettingsGroup>
      )}
    </ManageScreenShell>
  );
}

function InfoRow({
  Icon,
  label,
  value,
  isFirst,
}: {
  Icon?: (p: { size?: number; className?: string }) => React.ReactNode;
  label: string;
  value: string;
  isFirst?: boolean;
}) {
  return (
    <div
      className={[
        'flex min-h-[48px] items-center gap-3 px-4 py-2.5',
        !isFirst ? 'border-t border-gray-200/70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-gray-100 text-gray-600">
          <Icon size={16} />
        </span>
      ) : (
        <span className="w-7 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 text-[15px] text-gray-900">{label}</span>
      <span className="max-w-[55%] shrink-0 text-right text-[15px] text-gray-500">{value}</span>
    </div>
  );
}

function SectionCard({
  title,
  description,
  Icon,
  to,
  isLast,
}: {
  title: string;
  description: string;
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
  to: string;
  isLast?: boolean;
}) {
  return (
    <Link
      to={to}
      className={[
        'group flex min-h-[52px] items-center gap-3 px-4 py-3 transition-colors active:bg-gray-50',
        !isLast ? 'border-b border-gray-200/70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-normal text-gray-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>
      </div>
      <LuChevronRight className="h-[18px] w-[18px] shrink-0 text-gray-300" aria-hidden />
    </Link>
  );
}

