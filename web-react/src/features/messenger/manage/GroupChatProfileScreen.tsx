import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBell,
  LuBellOff,
  LuChevronLeft,
  LuChevronRight,
  LuDoorOpen,
  LuEllipsis,
  LuLink2,
  LuMessageCircle,
  LuRefreshCw,
  LuSettings2,
  LuShield,
  LuUserPlus,
  LuUsers,
} from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { useChatStore } from '../chatStore';
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import { formatMessengerLastSeen } from '../lastSeenUtils';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { ManageDialogShell } from './ManageDialogShell';
import { SharedMediaCard } from './SharedMediaCard';
import './privateChatProfile.css';
import './groupChatProfile.css';

const MEMBERS_PREVIEW = 8;

export type GroupChatProfileScreenProps = {
  chatId: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  isChannel: boolean;
  myRole: api.ParticipantRole | undefined;
  canEdit: boolean;
  canAddMembers: boolean;
  muted: boolean;
  inviteLink: string;
  onBack: () => void;
  onToggleMute: () => void;
  onCopyInvite: () => void;
  onResetInvite: () => void;
  onEditTitle: () => void;
  onEditDescription: () => void;
  onEditAvatar: () => void;
  onLeave: () => void;
};

function roleBadge(role: api.ParticipantRole): string | null {
  if (role === 'owner') return 'владелец';
  if (role === 'admin') return 'админ';
  return null;
}

/**
 * Профиль группы / канала — по образцу Telegram: крупный аватар, название, число участников,
 * быстрые действия, список участников и общие медиа. Цвета и тема — из приложения.
 */
export function GroupChatProfileScreen({
  chatId,
  title,
  description,
  avatarUrl,
  isChannel,
  myRole,
  canEdit,
  canAddMembers,
  muted,
  inviteLink,
  onBack,
  onToggleMute,
  onCopyInvite,
  onResetInvite,
  onEditTitle,
  onEditDescription,
  onEditAvatar,
  onLeave,
}: GroupChatProfileScreenProps) {
  const onlineMembers = useChatStore((s) => s.onlineMembers);
  const memberLastSeenAt = useChatStore((s) => s.memberLastSeenAt);
  const [members, setMembers] = useState<api.ConversationMember[] | null>(null);
  const [editMenu, setEditMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);

  useEffect(() => {
    let alive = true;
    void api
      .fetchConversationMembers(chatId)
      .then((m) => {
        if (alive) setMembers(m);
      })
      .catch(() => {
        if (alive) setMembers([]);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const withPresence = useMemo(
    () =>
      (members ?? []).map((m) => ({
        ...m,
        online: onlineMembers.has(m.member_id) || Boolean(m.is_online),
        seen: memberLastSeenAt[m.member_id] ?? m.last_seen_at ?? null,
      })),
    [members, onlineMembers, memberLastSeenAt],
  );

  /** Владелец → админы → в сети → остальные; в превью сначала самые «заметные». */
  const sorted = useMemo(() => {
    const rank = (m: (typeof withPresence)[number]) => (m.role === 'owner' ? 0 : m.role === 'admin' ? 1 : m.online ? 2 : 3);
    return [...withPresence].sort((a, b) => rank(a) - rank(b));
  }, [withPresence]);

  const total = members?.length ?? 0;
  const onlineCount = withPresence.filter((m) => m.online).length;
  const subtitle =
    members == null
      ? ' '
      : `${total} ${pluralMembers(total, isChannel)}${onlineCount > 0 ? `, ${onlineCount} в сети` : ''}`;
  const base = `/messenger/chat/${chatId}/manage`;
  const isStaff = myRole === 'owner' || myRole === 'admin';

  return (
    <div className="pcp gcp">
      <div className="gcp-bar">
        <button type="button" className="gcp-round-btn" onClick={onBack} aria-label="Назад">
          <LuChevronLeft size={24} strokeWidth={2.4} aria-hidden />
        </button>
        {canEdit ? (
          <button type="button" className="gcp-pill-btn" onClick={() => setEditMenu(true)}>
            Изм.
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>

      <header className="gcp-head">
        <div className="gcp-avatar" style={{ background: getAvatarColor(title || chatId) }}>
          <AppAvatar
            src={avatarUrl}
            className="gcp-avatar__box"
            imgClassName="gcp-avatar__img"
            fallback={<span className="gcp-avatar__fallback">{title ? getAvatarInitial(title, 'Г') : <LuUsers size={44} aria-hidden />}</span>}
            priority
          />
        </div>
        <h1 className="gcp-title">{title}</h1>
        <p className="gcp-sub">{subtitle}</p>
        {description ? <p className="gcp-desc">{description}</p> : null}
      </header>

      <div className="gcp-body">
        <div className="gcp-actions" role="group" aria-label="Быстрые действия">
          <GroupAction label="Чат" icon={<LuMessageCircle size={24} aria-hidden />} onClick={onBack} />
          <GroupAction
            label={muted ? 'Включить' : 'Звук'}
            icon={muted ? <LuBellOff size={24} aria-hidden /> : <LuBell size={24} aria-hidden />}
            onClick={onToggleMute}
            pressed={muted}
          />
          <GroupAction label="Ссылка" icon={<LuLink2 size={24} aria-hidden />} onClick={onCopyInvite} />
          <GroupAction label="Ещё" icon={<LuEllipsis size={24} aria-hidden />} onClick={() => setMoreMenu(true)} />
        </div>

        <section className="pcp-card gcp-members" aria-label="Участники">
          {canAddMembers ? (
            <Link to={`${base}/members`} className="gcp-add">
              <LuUserPlus size={26} aria-hidden />
              <span>Добавить участников</span>
            </Link>
          ) : null}

          {members == null ? (
            <div className="pcp-card__skeleton">
              <SkeletonBox width="100%" height="52px" radius="12px" />
              <SkeletonBox width="100%" height="52px" radius="12px" />
              <SkeletonBox width="70%" height="52px" radius="12px" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="pcp-empty">Не удалось загрузить участников.</p>
          ) : (
            <ul className="gcp-list">
              {sorted.slice(0, MEMBERS_PREVIEW).map((m) => {
                const name = [m.first_name, m.last_name].filter(Boolean).join(' ').trim() || m.name;
                const badge = roleBadge(m.role);
                return (
                  <li key={m.member_id}>
                    <Link
                      to={`/profile/member-${m.member_id}`}
                      state={{ backTo: base, backLabel: 'К группе' }}
                      className="gcp-member"
                    >
                      <span className="gcp-member__ava">
                        <AppAvatar
                          src={resolvePublicUrl(m.avatar_url ?? null)}
                          className="gcp-member__box"
                          imgClassName="gcp-member__img"
                          fallback={
                            <span className="gcp-member__fallback" style={{ background: getAvatarColor(name) }}>
                              {getAvatarInitial(name, 'U')}
                            </span>
                          }
                        />
                      </span>
                      <span className="gcp-member__text">
                        <span className="gcp-member__name">{name}</span>
                        <span className={['gcp-member__status', m.online ? 'gcp-member__status--online' : ''].join(' ')}>
                          {m.online ? 'в сети' : formatMessengerLastSeen(m.seen)}
                        </span>
                      </span>
                      {badge ? <span className="gcp-badge">{badge}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {total > MEMBERS_PREVIEW ? (
            <Link to={`${base}/members`} className="pcp-more">
              <span>Все участники ({total})</span>
              <LuChevronRight size={18} aria-hidden />
            </Link>
          ) : null}
        </section>

        <SharedMediaCard chatId={chatId} />

        {isStaff || canEdit ? (
          <section className="pcp-card gcp-manage" aria-label="Управление">
            <ManageLink to={`${base}/admins`} icon={<LuShield size={20} aria-hidden />} label="Администраторы" />
            <ManageLink to={`${base}/permissions`} icon={<LuSettings2 size={20} aria-hidden />} label="Разрешения" />
          </section>
        ) : null}

        <section className="pcp-card gcp-manage" aria-label="Выход">
          <button type="button" className="gcp-danger" onClick={onLeave}>
            <LuDoorOpen size={20} aria-hidden />
            <span>
              {myRole === 'owner' ? (isChannel ? 'Удалить канал' : 'Удалить группу') : isChannel ? 'Покинуть канал' : 'Покинуть группу'}
            </span>
          </button>
        </section>
      </div>

      {editMenu ? (
        <ManageDialogShell onClose={() => setEditMenu(false)} zIndexClassName="z-[4300]" backdropClassName="bg-black/35" align="bottom" contentClassName="rounded-3xl p-2">
          <SheetItem label="Изменить название" onClick={() => { setEditMenu(false); onEditTitle(); }} />
          <SheetItem label="Изменить описание" onClick={() => { setEditMenu(false); onEditDescription(); }} />
          <SheetItem label="Изменить фото" onClick={() => { setEditMenu(false); onEditAvatar(); }} />
        </ManageDialogShell>
      ) : null}

      {moreMenu ? (
        <ManageDialogShell onClose={() => setMoreMenu(false)} zIndexClassName="z-[4300]" backdropClassName="bg-black/35" align="bottom" contentClassName="rounded-3xl p-2">
          <SheetItem label="Копировать ссылку-приглашение" icon={<LuLink2 size={18} aria-hidden />} onClick={() => { setMoreMenu(false); onCopyInvite(); }} />
          {canEdit ? (
            <SheetItem label="Сбросить ссылку" icon={<LuRefreshCw size={18} aria-hidden />} onClick={() => { setMoreMenu(false); onResetInvite(); }} />
          ) : null}
          <SheetItem label="Участники" icon={<LuUsers size={18} aria-hidden />} to={`${base}/members`} onClick={() => setMoreMenu(false)} />
          <p className="gcp-sheet-note" title={inviteLink}>{inviteLink}</p>
        </ManageDialogShell>
      ) : null}
    </div>
  );
}

function pluralMembers(n: number, channel: boolean): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const forms = channel ? ['подписчик', 'подписчика', 'подписчиков'] : ['участник', 'участника', 'участников'];
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

function GroupAction({ icon, label, onClick, pressed }: { icon: ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" className={['gcp-action', pressed ? 'gcp-action--pressed' : ''].join(' ')} onClick={onClick} aria-pressed={pressed}>
      <span className="gcp-action__icon">{icon}</span>
      <span className="gcp-action__label">{label}</span>
    </button>
  );
}

function ManageLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="gcp-manage__row">
      <span className="gcp-manage__icon">{icon}</span>
      <span className="gcp-manage__label">{label}</span>
      <LuChevronRight size={18} className="gcp-manage__chev" aria-hidden />
    </Link>
  );
}

function SheetItem({ label, icon, onClick, to }: { label: string; icon?: ReactNode; onClick: () => void; to?: string }) {
  const inner = (
    <>
      {icon ? <span className="gcp-sheet__icon">{icon}</span> : null}
      <span>{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className="gcp-sheet__item" onClick={onClick}>{inner}</Link>
  ) : (
    <button type="button" className="gcp-sheet__item" onClick={onClick}>{inner}</button>
  );
}
