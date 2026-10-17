import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBell,
  LuBellOff,
  LuCake,
  LuChevronLeft,
  LuChurch,
  LuCopy,
  LuLayers,
  LuMessageCircle,
  LuPhone,
  LuShield,
  LuUser,
  LuVideo,
  LuX,
} from 'react-icons/lu';
import { AppAvatar } from '../../../components/AppAvatar';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { formatBirthDateDisplay, parseBirthDayMonthFromApi } from '../../../lib/birthDate';
import { emitAppToast } from '../../../lib/uiFeedback';
import { appRoleLabel } from '../../settings/sectionVisibilityApi';
import type { AppRole } from '../../settings/sectionVisibilityApi';
import { requestCallNotificationsFromUserGesture } from '../../calls/incomingCallBackground';
import { useCallStore } from '../../calls/callStore';
import { getAvatarInitial } from '../avatarUtils';
import type { PrivateChatProfile } from '../api/messengerApi';
import { SharedMediaCard } from './SharedMediaCard';
import './privateChatProfile.css';

const CALLS_FEATURE_ENABLED = import.meta.env.VITE_CALLS_ENABLED === 'true';

/** Верх фирменного градиента шапки (см. --primary проекта); литерал — акцент темы бывает светлым. */
const HERO_TOP_COLOR = '#7d3640';

export type PrivateChatProfileScreenProps = {
  chatId: string;
  /** Собеседник — для звонка. */
  peer: { id: number; name: string; avatarUrl: string | null } | null;
  fullName: string;
  avatarUrl: string | null;
  statusText: string;
  isOnline: boolean;
  profile: PrivateChatProfile | null;
  muted: boolean;
  onToggleMute: () => void;
  onBack: () => void;
  onClose: () => void;
  /** Страница собеседника в приложении (лента) — теперь только отдельной кнопкой, а не по тапу на имя. */
  profilePath: string | null;
};

/** «Ведущий, Оператор» → ['Ведущий', 'Оператор']. */
function splitList(value: string | null | undefined): string[] {
  return String(value ?? '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Дней до ближайшего дня рождения (0 — сегодня); null — даты нет. */
function daysUntilBirthday(birth: string | null | undefined, now = new Date()): number | null {
  const { day, month } = parseBirthDayMonthFromApi(birth);
  const d = Number(day);
  const m = Number(month);
  if (!d || !m) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

function pluralDays(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'дней';
  if (b === 1) return 'день';
  if (b >= 2 && b <= 4) return 'дня';
  return 'дней';
}

/**
 * Профиль собеседника в личном чате — по образцу Telegram: цветная шапка с аватаром и быстрыми
 * действиями, карточка данных (телефон, день рождения, служение) и история общих медиа, файлов и ссылок.
 * Один адаптивный экран для телефона, планшета и ПК.
 */
export function PrivateChatProfileScreen({
  chatId,
  peer,
  fullName,
  avatarUrl,
  statusText,
  isOnline,
  profile,
  muted,
  onToggleMute,
  onBack,
  onClose,
  profilePath,
}: PrivateChatProfileScreenProps) {

  /** Пока экран открыт, полоса под статус-баром iOS-PWA красится в цвет верха шапки, а не в фон страницы. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-status-bar-bg', HERO_TOP_COLOR);
    return () => {
      root.style.removeProperty('--app-status-bar-bg');
    };
  }, []);

  const phone = profile?.phone_number?.trim() || '';
  const birthText = formatBirthDateDisplay(profile?.birth_date);
  const birthIn = daysUntilBirthday(profile?.birth_date);
  const ministryRoles = splitList(profile?.ministry_role);
  const directions = splitList(profile?.ministry_direction);
  const appRoles = splitList(profile?.app_role).map((r) => appRoleLabel(r as AppRole));
  const hasInfo = Boolean(phone || birthText || ministryRoles.length || directions.length || appRoles.length);

  const startCall = (callType: 'audio' | 'video') => {
    if (!CALLS_FEATURE_ENABLED) {
      emitAppToast('Звонки временно отключены', 'info');
      return;
    }
    if (!peer) return;
    requestCallNotificationsFromUserGesture();
    void import('../../calls/callRingtone').then((m) => m.unlockCallAudio());
    void (async () => {
      try {
        const { createDirectCall } = await import('../../calls/callsApi');
        const call = await createDirectCall({ conversationId: chatId, recipientId: peer.id, mediaType: callType });
        useCallStore.getState().openCall({
          callId: call.id,
          conversationId: chatId,
          peerId: peer.id,
          peerName: peer.name,
          peerAvatar: peer.avatarUrl ?? '',
          callType,
          isInitiator: true,
          status: 'calling',
          callKind: 'direct',
        });
      } catch (e) {
        emitAppToast(e instanceof Error ? e.message : 'Не удалось начать звонок', 'error');
      }
    })();
  };

  const copyPhone = () => {
    if (!phone) return;
    void navigator.clipboard?.writeText(phone).then(
      () => emitAppToast('Номер скопирован', 'success'),
      () => emitAppToast('Не удалось скопировать номер', 'error'),
    );
  };

  return (
    <div className="pcp">
      <header className="pcp-hero">
        <div className="pcp-hero__bar">
          <button type="button" className="pcp-glass-btn" onClick={onBack} aria-label="Назад к чату">
            <LuChevronLeft size={24} strokeWidth={2.4} aria-hidden />
          </button>
          <button type="button" className="pcp-glass-btn" onClick={onClose} aria-label="Закрыть мессенджер">
            <LuX size={22} strokeWidth={2.4} aria-hidden />
          </button>
        </div>

        <div className="pcp-hero__avatar">
          <AppAvatar
            src={avatarUrl}
            className="pcp-hero__avatar-box"
            imgClassName="pcp-hero__avatar-img"
            fallback={<span className="pcp-hero__avatar-fallback">{getAvatarInitial(fullName, 'U')}</span>}
            priority
          />
          {isOnline ? <span className="pcp-hero__online" aria-label="в сети" /> : null}
        </div>
        <h1 className="pcp-hero__name">{fullName}</h1>
        <p className={['pcp-hero__status', isOnline ? 'pcp-hero__status--online' : ''].join(' ')}>{statusText}</p>

        <div className="pcp-actions" role="group" aria-label="Быстрые действия">
          <ActionTile label="Чат" onClick={onBack} icon={<LuMessageCircle size={22} aria-hidden />} />
          {CALLS_FEATURE_ENABLED && peer ? (
            <>
              <ActionTile label="Звонок" onClick={() => startCall('audio')} icon={<LuPhone size={22} aria-hidden />} />
              <ActionTile label="Видео" onClick={() => startCall('video')} icon={<LuVideo size={22} aria-hidden />} />
            </>
          ) : null}
          <ActionTile
            label={muted ? 'Включить' : 'Звук'}
            onClick={onToggleMute}
            pressed={muted}
            icon={muted ? <LuBellOff size={22} aria-hidden /> : <LuBell size={22} aria-hidden />}
          />
          {profilePath ? (
            <Link to={profilePath} state={{ backTo: `/messenger/chat/${chatId}/manage`, backLabel: 'К профилю' }} className="pcp-action">
              <span className="pcp-action__icon"><LuUser size={22} aria-hidden /></span>
              <span className="pcp-action__label">Страница</span>
            </Link>
          ) : null}
        </div>
      </header>

      <main className="pcp-body">
        <section className="pcp-card" aria-label="Сведения">
          {!profile ? (
            <div className="pcp-card__skeleton">
              <SkeletonBox width="100%" height="48px" radius="12px" />
              <SkeletonBox width="100%" height="48px" radius="12px" />
              <SkeletonBox width="70%" height="48px" radius="12px" />
            </div>
          ) : !hasInfo ? (
            <p className="pcp-empty">Собеседник пока не заполнил данные.</p>
          ) : (
            <>
              {phone ? (
                <div className="pcp-row">
                  <span className="pcp-row__icon pcp-row__icon--phone"><LuPhone size={18} aria-hidden /></span>
                  <div className="pcp-row__main">
                    <span className="pcp-row__label">Телефон</span>
                    <a className="pcp-row__value pcp-row__value--link" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
                  </div>
                  <button type="button" className="pcp-row__action" onClick={copyPhone} aria-label="Скопировать номер">
                    <LuCopy size={17} aria-hidden />
                  </button>
                </div>
              ) : null}

              {birthText ? (
                <div className="pcp-row">
                  <span className="pcp-row__icon pcp-row__icon--birthday"><LuCake size={18} aria-hidden /></span>
                  <div className="pcp-row__main">
                    <span className="pcp-row__label">День рождения</span>
                    <span className="pcp-row__value">{birthText}</span>
                  </div>
                  {birthIn != null && birthIn <= 30 ? (
                    <span className="pcp-badge">{birthIn === 0 ? 'сегодня' : `через ${birthIn} ${pluralDays(birthIn)}`}</span>
                  ) : null}
                </div>
              ) : null}

              {ministryRoles.length ? (
                <ChipsRow
                  icon={<LuChurch size={18} aria-hidden />}
                  iconClass="pcp-row__icon--ministry"
                  label="Служение"
                  items={ministryRoles}
                />
              ) : null}
              {directions.length ? (
                <ChipsRow
                  icon={<LuLayers size={18} aria-hidden />}
                  iconClass="pcp-row__icon--direction"
                  label="Направление"
                  items={directions}
                />
              ) : null}
              {appRoles.length ? (
                <ChipsRow
                  icon={<LuShield size={18} aria-hidden />}
                  iconClass="pcp-row__icon--role"
                  label="Роль в приложении"
                  items={appRoles}
                  muted
                />
              ) : null}
            </>
          )}
        </section>

        <SharedMediaCard chatId={chatId} />
      </main>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  onClick,
  disabled,
  pressed,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      className={['pcp-action', pressed ? 'pcp-action--pressed' : ''].join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      <span className="pcp-action__icon">{icon}</span>
      <span className="pcp-action__label">{label}</span>
    </button>
  );
}

function ChipsRow({
  icon,
  iconClass,
  label,
  items,
  muted,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  items: string[];
  muted?: boolean;
}) {
  return (
    <div className="pcp-row pcp-row--top">
      <span className={['pcp-row__icon', iconClass].join(' ')}>{icon}</span>
      <div className="pcp-row__main">
        <span className="pcp-row__label">{label}</span>
        <ul className="pcp-chips">
          {items.map((it) => (
            <li key={it} className={['pcp-chip', muted ? 'pcp-chip--muted' : ''].join(' ')}>{it}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
