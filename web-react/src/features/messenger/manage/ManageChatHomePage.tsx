import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LuBell,
  LuCake,
  LuChevronRight,
  LuCopy,
  LuDoorOpen,
  LuFileImage,
  LuLink2,
  LuPhone,
  LuPencil,
  LuRefreshCw,
  LuSettings2,
  LuShield,
  LuUsers,
  LuX,
} from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import { useChatStore } from '../chatStore';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { emitAppToast } from '../../../lib/uiFeedback';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { ManageDialogShell } from './ManageDialogShell';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { getAvatarInitial } from '../avatarUtils';

export function ManageChatHomePage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const memberLastSeenAt = useChatStore((s) => s.memberLastSeenAt);
  const conversations = useChatStore((s) => s.conversations);
  const patchChatMyUi = useChatStore((s) => s.patchChatMyUi);
  const leaveChat = useChatStore((s) => s.leaveChat);
  const conv = useMemo(() => conversations.find((c) => c.id === chatId) ?? null, [conversations, chatId]);
  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [privateProfile, setPrivateProfile] = useState<api.PrivateChatProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [muteDuration, setMuteDuration] = useState<'1h' | '8h' | '1d' | 'forever'>('forever');
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [showDescriptionEditor, setShowDescriptionEditor] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isPrivate = conv?.type === 'private';
  const isMuted = conv?.my_muted === true;
  const title =
    conv?.type === 'private'
      ? (conv.other_member?.first_name ? `${conv.other_member.first_name} ${conv.other_member.last_name ?? ''}`.trim() : conv.other_member?.name) ?? 'Чат'
      : conv?.title ?? meta?.title ?? 'Чат';

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void api.fetchConversationMeta(chatId)
      .then((m) => {
        if (!alive) return;
        setMeta(m);
        setTitleDraft(m.title ?? '');
        const description = String((m.settings as { description?: unknown } | undefined)?.description ?? '').trim();
        setDescriptionDraft(description);
        const token = String((m.settings as { invite_token?: unknown } | undefined)?.invite_token ?? '').trim();
        setInviteToken(token || randomInviteToken());
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

  useEffect(() => {
    if (!chatId || !isPrivate) return;
    let alive = true;
    void api.fetchPrivateChatProfile(chatId)
      .then((p) => {
        if (alive) setPrivateProfile(p);
      })
      .catch(() => {
        if (alive) setPrivateProfile(null);
      });
    return () => {
      alive = false;
    };
  }, [chatId, isPrivate]);

  const persistMetaSettings = async (patch: Record<string, unknown>) => {
    if (!chatId) return;
    await api.patchConversationPermissions(chatId, { settings: { ...(meta?.settings ?? {}), ...patch } });
    const next = await api.fetchConversationMeta(chatId, { bypassCache: true });
    setMeta(next);
  };

  const saveTitle = async () => {
    if (!chatId) return;
    const nextTitle = titleDraft.trim();
    if (!nextTitle) return;
    try {
      await api.updateConversation(chatId, { title: nextTitle });
      await useChatStore.getState().loadConversations({ force: true });
      const next = await api.fetchConversationMeta(chatId, { bypassCache: true });
      setMeta(next);
      setShowTitleEditor(false);
      emitAppToast('Название сохранено', 'success');
    } catch {
      emitAppToast('Не удалось сохранить название', 'error');
    }
  };

  const saveDescription = async () => {
    try {
      await persistMetaSettings({ description: descriptionDraft.slice(0, 255) });
      setShowDescriptionEditor(false);
    } catch {
      emitAppToast('Не удалось сохранить описание', 'error');
    }
  };

  const updateAvatar = async (file: File | null) => {
    if (!file || !chatId || !file.type.startsWith('image/')) return;
    try {
      const toSend = await compressImageForMessengerUpload(file);
      const up = await api.uploadFile(toSend, { conversationId: chatId });
      await api.updateConversation(chatId, { avatar_url: up.url });
      await useChatStore.getState().loadConversations({ force: true });
      const next = await api.fetchConversationMeta(chatId, { bypassCache: true });
      setMeta(next);
      emitAppToast('Фото обновлено', 'success');
    } catch {
      emitAppToast('Не удалось обновить фото', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const inviteLink = `https://app.church-tambov.ru/join/${inviteToken}`;
  const mediaHintCount = Number((meta?.settings as { media_count?: unknown } | undefined)?.media_count ?? 0);

  if (isPrivate) {
    const privateAvatarUrl = resolvePublicUrl(privateProfile?.avatar_url ?? conv?.other_member?.avatar_url ?? null);
    const fullName = privateProfile
      ? [privateProfile.first_name, privateProfile.last_name].filter(Boolean).join(' ').trim() || privateProfile.name
      : title;
    const isOnline = privateProfile ? onlineMembers.has(privateProfile.id) : false;
    const statusText = isOnline
      ? 'в сети'
      : formatMessengerLastSeen(privateProfile ? memberLastSeenAt[privateProfile.id] ?? privateProfile.last_seen_at : null);
    return (
      <ManageScreenShell>
        <ManageSettingsGroup className="mt-4">
          <div className="flex flex-col items-center px-5 pb-4 pt-6">
            <div className="relative h-[72px] w-[72px] overflow-hidden rounded-full bg-primary/10 ring-2 ring-white shadow-sm">
              <AppAvatar
                src={privateAvatarUrl}
                className="h-full w-full"
                imgClassName="h-full w-full object-cover"
                fallback={<div className="grid h-full w-full place-items-center text-2xl font-semibold text-primary">{getAvatarInitial(fullName, 'U')}</div>}
              />
            </div>
            <p className="mt-3 text-center text-lg font-semibold text-[var(--text)]">{fullName}</p>
            <p className="mt-1 text-sm text-blue-500">{statusText}</p>
          </div>
        </ManageSettingsGroup>
        <ManageSettingsGroup className="mt-3">
          <InfoRow Icon={LuPhone} label="Телефон" value={privateProfile?.phone_number ?? '—'} isFirst />
          <InfoRow label="Роль в проекте" value={privateProfile?.app_role ?? '—'} />
          <InfoRow label="Роль (служение)" value={privateProfile?.ministry_role ?? '—'} />
          <InfoRow label="Направление" value={privateProfile?.ministry_direction ?? '—'} />
          <InfoRow Icon={LuCake} label="Дата рождения" value={privateProfile?.birth_date ?? '—'} />
        </ManageSettingsGroup>
      </ManageScreenShell>
    );
  }

  if (loading) {
    return (
      <ManageScreenShell>
        <ManageSettingsGroup className="mt-4 p-4">
          <div className="flex flex-col items-center gap-3">
            <SkeletonBox width="104px" height="104px" radius="999px" />
            <SkeletonBox width="58%" height="18px" />
            <SkeletonBox width="36%" height="12px" />
          </div>
        </ManageSettingsGroup>
        <ManageCardSkeleton rows={2} />
        <ManageCardSkeleton rows={4} />
        <ManageCardSkeleton rows={2} />
      </ManageScreenShell>
    );
  }

  return (
    <ManageScreenShell>
      <ManageSettingsGroup className="mt-4 overflow-hidden">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void updateAvatar(e.target.files?.[0] ?? null)} />
        <div className="px-4 pb-5 pt-6 text-center">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative mx-auto h-[6.5rem] w-[6.5rem] overflow-hidden rounded-full bg-gradient-to-br from-primary/15 to-primary/5 shadow-md ring-2 ring-white">
            <AppAvatar
              src={resolvePublicUrl(conv?.avatar_url ?? meta?.avatar_url ?? null)}
              className="h-full w-full"
              imgClassName="h-full w-full object-cover"
              fallback={<div className="grid h-full w-full place-items-center text-primary"><LuUsers size={34} /></div>}
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/45 py-1 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100">Изменить</span>
          </button>
          <button
            type="button"
            onClick={() => setShowTitleEditor(true)}
            className="mt-3 inline-flex max-w-full items-center gap-1 text-2xl font-bold text-[var(--text)]"
          >
            <span className="truncate">{title}</span>
            <LuPencil size={14} className="shrink-0 text-[var(--text-muted)]" />
          </button>
          <button
            type="button"
            onClick={() => setShowDescriptionEditor(true)}
            className="mt-1 block w-full text-sm text-[var(--text-secondary)]"
          >
            {descriptionDraft || 'Добавить описание'}
          </button>
          <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">{loading ? '...' : subtitleFromMeta(meta)}</p>
        </div>
      </ManageSettingsGroup>

      <SectionLabel>Приглашение</SectionLabel>
      <ManageSettingsGroup className="mt-3">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><LuLink2 size={18} /></div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-[var(--text)]">Ссылка-приглашение</p>
            <p className="truncate text-sm text-[var(--text-secondary)]">{inviteLink}</p>
          </div>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(inviteLink); emitAppToast('Ссылка скопирована', 'success'); }} className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)]">
            <LuCopy size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            const next = randomInviteToken();
            setInviteToken(next);
            void persistMetaSettings({ invite_token: next }).catch(() => emitAppToast('Не удалось сбросить ссылку', 'error'));
          }}
          className="flex w-full items-center gap-3 border-t border-gray-200/70 px-4 py-3 text-left text-red-600"
        >
          <LuRefreshCw size={18} />
          <span className="text-base font-medium">Сбросить ссылку</span>
        </button>
      </ManageSettingsGroup>

      <SectionLabel>Управление</SectionLabel>
      <ManageSettingsGroup className="mt-3">
        <SectionCard title="Участники" description="Список и управление" Icon={LuUsers} to={chatId ? `/messenger/chat/${chatId}/manage/members` : '/messenger'} />
        <SectionCard title="Администраторы" description="Назначение и ограничения" Icon={LuShield} to={chatId ? `/messenger/chat/${chatId}/manage/admins` : '/messenger'} />
        <SectionCard title="Разрешения" description="Кто может писать и приглашать" Icon={LuSettings2} to={chatId ? `/messenger/chat/${chatId}/manage/permissions` : '/messenger'} />
        <SectionCard title="Медиа, файлы и ссылки" description={`${mediaHintCount} элементов`} Icon={LuFileImage} to={chatId ? `/messenger/chat/${chatId}/manage/media` : '/messenger'} isLast />
      </ManageSettingsGroup>

      <SectionLabel>Уведомления</SectionLabel>
      <ManageSettingsGroup className="mt-3">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><LuBell size={18} /></div>
          <span className="min-w-0 flex-1 text-base font-medium text-[var(--text)]">Уведомления</span>
          <button
            type="button"
            role="switch"
            aria-checked={!isMuted}
            onClick={() => {
              if (!chatId) return;
              void patchChatMyUi(chatId, { muted: !isMuted });
            }}
            className={['relative h-7 w-12 rounded-full p-1 transition', !isMuted ? 'bg-primary' : 'bg-stone-300'].join(' ')}
          >
            <span className={['block h-5 w-5 rounded-full bg-white shadow transition', !isMuted ? 'translate-x-5' : 'translate-x-0'].join(' ')} />
          </button>
        </div>
        {!isMuted ? (
          <div className="border-t border-gray-200/70 px-4 py-2.5">
            <div className="flex flex-wrap gap-2">
              {(['1h', '8h', '1d', 'forever'] as const).map((dur) => (
                <button
                  key={dur}
                  type="button"
                  onClick={() => {
                    setMuteDuration(dur);
                    if (!chatId) return;
                    void patchChatMyUi(chatId, { muted: true });
                  }}
                  className={['rounded-full px-3 py-1.5 text-xs font-semibold', muteDuration === dur ? 'bg-primary text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)]'].join(' ')}
                >
                  {dur === '1h' ? '1 час' : dur === '8h' ? '8 часов' : dur === '1d' ? '1 день' : 'навсегда'}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </ManageSettingsGroup>

      <SectionLabel>Опасная зона</SectionLabel>
      <ManageSettingsGroup className="mt-3">
        <button
          type="button"
          onClick={() => {
            if (!chatId) return;
            if (!window.confirm('Вы уверены? Вас нужно будет снова пригласить.')) return;
            void leaveChat(chatId).then(() => navigate('/messenger'));
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left text-red-600"
        >
          <LuDoorOpen size={18} />
          <span className="text-base font-medium">Покинуть группу</span>
        </button>
      </ManageSettingsGroup>

      {err ? <p className="mt-3 text-sm font-medium text-red-600">{err}</p> : null}

      {showTitleEditor ? (
        <InlineEditorModal
          title="Название группы"
          value={titleDraft}
          maxLength={120}
          onChange={setTitleDraft}
          onClose={() => setShowTitleEditor(false)}
          onSave={() => void saveTitle()}
          multiline={false}
        />
      ) : null}
      {showDescriptionEditor ? (
        <InlineEditorModal
          title="Описание группы"
          value={descriptionDraft}
          maxLength={255}
          onChange={(v) => setDescriptionDraft(v.slice(0, 255))}
          onClose={() => setShowDescriptionEditor(false)}
          onSave={() => void saveDescription()}
          multiline
        />
      ) : null}
    </ManageScreenShell>
  );
}

function subtitleFromMeta(meta: api.ConversationMeta | null): string {
  if (!meta) return 'Группа';
  if (meta.type === 'channel') return 'Канал';
  if (meta.type === 'group') return 'Группа';
  return 'Личный чат';
}

function randomInviteToken(): string {
  return Math.random().toString(36).slice(2, 12);
}

function ManageCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ManageSettingsGroup className="mt-3 p-4">
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, idx) => (
          <SkeletonBox key={idx} width="100%" height="46px" radius="12px" />
        ))}
      </div>
    </ManageSettingsGroup>
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
        !isFirst ? 'border-t border-stone-200/70' : '',
      ].filter(Boolean).join(' ')}
    >
      {Icon ? (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--surface)] text-[var(--text-secondary)]">
          <Icon size={16} />
        </span>
      ) : (
        <span className="w-7 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1 text-base text-[var(--text)]">{label}</span>
      <span className="max-w-[55%] shrink-0 text-right text-base text-[var(--text-secondary)]">{value}</span>
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
        'group flex min-h-[54px] items-center gap-3 px-4 py-3 transition-colors active:bg-[var(--surface)]',
        !isLast ? 'border-b border-stone-200/70' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-[var(--text)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>
      </div>
      <LuChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)]" aria-hidden />
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky top-[56px] z-[5] mt-4 px-1">
      <p className="rounded-full bg-[var(--surface)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] backdrop-blur">
        {children}
      </p>
    </div>
  );
}

function InlineEditorModal({
  title,
  value,
  maxLength,
  multiline,
  onChange,
  onClose,
  onSave,
}: {
  title: string;
  value: string;
  maxLength: number;
  multiline: boolean;
  onChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <ManageDialogShell
      onClose={onClose}
      zIndexClassName="z-[4300]"
      backdropClassName="bg-black/35"
      contentClassName="rounded-t-3xl p-4"
    >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-semibold text-[var(--text)]">{title}</p>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface)] text-[var(--text-secondary)]">
            <LuX size={16} />
          </button>
        </div>
        {multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            maxLength={maxLength}
            className="min-h-[120px] w-full rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            maxLength={maxLength}
            className="min-h-[44px] w-full rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-2 text-base font-semibold text-[var(--text)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        )}
        <p className="mt-1 text-right text-xs text-[var(--text-muted)]">{value.length}/{maxLength}</p>
        <button
          type="button"
          onClick={onSave}
          className="mt-3 w-full min-h-[46px] rounded-xl bg-primary px-4 py-2 text-base font-semibold text-white"
        >
          Сохранить
        </button>
    </ManageDialogShell>
  );
}
