import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  LuX,
} from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { compressImageForMessengerUpload } from '../compressImageForUpload';
import { useChatStore } from '../chatStore';
import { isConversationRemoved } from '../chatStoreWsBatch';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { emitAppToast } from '../../../lib/uiFeedback';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { GroupChatProfileScreen } from './GroupChatProfileScreen';
import { useAuthStore } from '../../auth/authStore';
import { canAddParticipantsToGroup, canManageGroupMessenger, isAppAdministratorRole } from './messengerManageAccess';
import { ManageDialogShell } from './ManageDialogShell';
import { PrivateChatProfileScreen } from './PrivateChatProfileScreen';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { isAssistantMessengerChannel } from '../messengerChannelKinds';

export function ManageChatHomePage() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const memberLastSeenAt = useChatStore((s) => s.memberLastSeenAt);
  const conversations = useChatStore((s) => s.conversations);
  const patchChatMyUi = useChatStore((s) => s.patchChatMyUi);
  const leaveChat = useChatStore((s) => s.leaveChat);
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const isAppAdministrator = useMemo(() => isAppAdministratorRole(authRole, authRoles), [authRole, authRoles]);
  const conv = useMemo(() => conversations.find((c) => c.id === chatId) ?? null, [conversations, chatId]);
  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [privateProfile, setPrivateProfile] = useState<api.PrivateChatProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [inviteToken, setInviteToken] = useState('');
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
    if (!chatId || !isConversationRemoved(chatId)) return;
    navigate('/messenger', { replace: true });
  }, [chatId, conv, navigate]);

  useEffect(() => {
    if (!chatId) return;
    if (isAssistantMessengerChannel(conv?.metadata ?? meta?.metadata)) {
      navigate(`/messenger/chat/${chatId}`, { replace: true });
    }
  }, [chatId, conv?.metadata, meta?.metadata, navigate]);

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

  if (isPrivate) {
    const privateAvatarUrl = resolvePublicUrl(privateProfile?.avatar_url ?? conv?.other_member?.avatar_url ?? null);
    const fullName = privateProfile
      ? [privateProfile.first_name, privateProfile.last_name].filter(Boolean).join(' ').trim() || privateProfile.name
      : title;
    const isOnline = privateProfile ? onlineMembers.has(privateProfile.id) : false;
    const statusText = isOnline
      ? 'в сети'
      : formatMessengerLastSeen(privateProfile ? memberLastSeenAt[privateProfile.id] ?? privateProfile.last_seen_at : null);
    const other = conv?.other_member ?? null;
    const peerId = privateProfile?.id ?? other?.id ?? null;
    return (
      <PrivateChatProfileScreen
        chatId={chatId ?? ''}
        peer={peerId != null ? { id: peerId, name: fullName, avatarUrl: privateAvatarUrl } : null}
        fullName={fullName}
        avatarUrl={privateAvatarUrl}
        statusText={statusText}
        isOnline={isOnline}
        profile={privateProfile}
        muted={isMuted}
        onToggleMute={() => {
          if (!chatId) return;
          void patchChatMyUi(chatId, { muted: !isMuted });
        }}
        onBack={() => navigate(-1)}
        onClose={() => navigate('/messenger')}
        profilePath={peerId != null ? `/profile/member-${peerId}` : null}
      />
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

  const isStaffRole = meta?.my_role === 'owner' || meta?.my_role === 'admin';
  const canEdit = isStaffRole || canManageGroupMessenger(meta?.my_effective_permissions, isAppAdministrator);
  const canAddMembers = canAddParticipantsToGroup(meta?.my_effective_permissions, isAppAdministrator);

  const copyInvite = () => {
    void navigator.clipboard?.writeText(inviteLink);
    emitAppToast('Ссылка скопирована', 'success');
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void updateAvatar(e.target.files?.[0] ?? null)} />
      <GroupChatProfileScreen
        chatId={chatId ?? ''}
        title={title}
        description={descriptionDraft}
        avatarUrl={resolvePublicUrl(conv?.avatar_url ?? meta?.avatar_url ?? null)}
        isChannel={(conv?.type ?? meta?.type) === 'channel'}
        myRole={meta?.my_role}
        canEdit={canEdit}
        canAddMembers={canAddMembers}
        muted={isMuted}
        inviteLink={inviteLink}
        onBack={() => navigate(-1)}
        onToggleMute={() => {
          if (!chatId) return;
          void patchChatMyUi(chatId, { muted: !isMuted });
        }}
        onCopyInvite={copyInvite}
        onResetInvite={() => {
          const next = randomInviteToken();
          setInviteToken(next);
          void persistMetaSettings({ invite_token: next }).then(
            () => emitAppToast('Ссылка сброшена', 'success'),
            () => emitAppToast('Не удалось сбросить ссылку', 'error'),
          );
        }}
        onEditTitle={() => setShowTitleEditor(true)}
        onEditDescription={() => setShowDescriptionEditor(true)}
        onEditAvatar={() => fileRef.current?.click()}
        onLeave={() => {
          if (!chatId) return;
          const ownerDeletes = meta?.my_role === 'owner';
          const noun = (conv?.type ?? meta?.type) === 'channel' ? 'канал' : 'группу';
          const confirmed = ownerDeletes
            ? window.confirm(`Удалить ${noun} для всех участников? Переписка будет стёрта, чат пропадёт у всех и из базы.`)
            : window.confirm('Вы уверены? Вас нужно будет снова пригласить.');
          if (!confirmed) return;
          void leaveChat(chatId).then(() => navigate('/messenger'));
        }}
      />
      {err ? <p className="px-4 pb-4 text-sm font-medium text-red-600">{err}</p> : null}

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
    </>
  );
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
      contentClassName="rounded-3xl p-4"
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
