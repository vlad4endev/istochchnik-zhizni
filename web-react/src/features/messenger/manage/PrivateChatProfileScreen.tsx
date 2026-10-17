import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBell,
  LuBellOff,
  LuCake,
  LuChevronLeft,
  LuChevronRight,
  LuChurch,
  LuCopy,
  LuFile,
  LuFileArchive,
  LuFileSpreadsheet,
  LuFileText,
  LuImage,
  LuLayers,
  LuLink2,
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
import { getAvatarColor, getAvatarInitial } from '../avatarUtils';
import type { PrivateChatProfile } from '../api/messengerApi';
import { useConversationSharedMedia } from './useConversationSharedMedia';
import './privateChatProfile.css';

const CALLS_FEATURE_ENABLED = import.meta.env.VITE_CALLS_ENABLED === 'true';

type MediaTab = 'media' | 'files' | 'links';

const MEDIA_PREVIEW = 18;
const FILES_PREVIEW = 6;
const LINKS_PREVIEW = 6;

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

function fileIcon(name: string): ReactNode {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <LuFileSpreadsheet size={20} aria-hidden />;
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return <LuFileArchive size={20} aria-hidden />;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <LuFileText size={20} aria-hidden />;
  return <LuFile size={20} aria-hidden />;
}

function fileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').slice(0, 5).toUpperCase() : 'ФАЙЛ';
}

function linkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
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
  const heroColor = useMemo(() => getAvatarColor(String(peer?.id ?? fullName)), [peer?.id, fullName]);
  const [tab, setTab] = useState<MediaTab>('media');
  const { loading, err, mediaItems, fileItems, linkItems } = useConversationSharedMedia(chatId);

  /** Пока экран открыт, полоса под статус-баром iOS-PWA красится в цвет шапки, а не в фон страницы. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--app-status-bar-bg', heroColor);
    return () => {
      root.style.removeProperty('--app-status-bar-bg');
    };
  }, [heroColor]);

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
    <div className="pcp" style={{ ['--pcp-color' as string]: heroColor }}>
      <header className="pcp-hero">
        <div className="pcp-hero__pattern" aria-hidden />
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

        <section className="pcp-card pcp-media" aria-label="Общие медиа, файлы и ссылки">
          <div className="pcp-tabs" role="tablist" aria-label="История вложений">
            <TabBtn active={tab === 'media'} onClick={() => setTab('media')} label="Медиа" count={mediaItems.length} loading={loading} />
            <TabBtn active={tab === 'files'} onClick={() => setTab('files')} label="Файлы" count={fileItems.length} loading={loading} />
            <TabBtn active={tab === 'links'} onClick={() => setTab('links')} label="Ссылки" count={linkItems.length} loading={loading} />
          </div>

          {loading ? (
            <div className="pcp-media__skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonBox key={i} width="100%" height="100%" radius="0" className="pcp-media__skeleton-cell" />
              ))}
            </div>
          ) : null}
          {err ? <p className="pcp-empty pcp-empty--error">{err}</p> : null}

          {!loading && !err && tab === 'media' ? (
            mediaItems.length ? (
              <div className="pcp-grid" role="tabpanel">
                {mediaItems.slice(0, MEDIA_PREVIEW).map((item, i) => (
                  <a key={`${item.id}-${i}`} href={item.src} target="_blank" rel="noreferrer" className="pcp-grid__cell">
                    <img src={item.src} alt="" loading="lazy" decoding="async" />
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState icon={<LuImage size={28} aria-hidden />} text="Фото, которыми вы обменялись, появятся здесь" />
            )
          ) : null}

          {!loading && !err && tab === 'files' ? (
            fileItems.length ? (
              <ul className="pcp-list" role="tabpanel">
                {fileItems.slice(0, FILES_PREVIEW).map((item, i) => (
                  <li key={`${item.id}-${i}`}>
                    <a href={item.href} target="_blank" rel="noreferrer" className="pcp-file">
                      <span className="pcp-file__icon">{fileIcon(item.name)}</span>
                      <span className="pcp-file__name">{item.name}</span>
                      <span className="pcp-file__ext">{fileExt(item.name)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<LuFile size={28} aria-hidden />} text="Файлы и документы появятся здесь" />
            )
          ) : null}

          {!loading && !err && tab === 'links' ? (
            linkItems.length ? (
              <ul className="pcp-list" role="tabpanel">
                {linkItems.slice(0, LINKS_PREVIEW).map((item, i) => (
                  <li key={`${item.id}-${i}`}>
                    <a href={item.url} target="_blank" rel="noreferrer" className="pcp-file">
                      <span className="pcp-file__icon pcp-file__icon--link"><LuLink2 size={20} aria-hidden /></span>
                      <span className="pcp-file__text">
                        <span className="pcp-file__name">{linkHost(item.url)}</span>
                        <span className="pcp-file__sub">{item.url}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<LuLink2 size={28} aria-hidden />} text="Ссылки из переписки появятся здесь" />
            )
          ) : null}

          {!loading && !err && (mediaItems.length > MEDIA_PREVIEW || fileItems.length > FILES_PREVIEW || linkItems.length > LINKS_PREVIEW) ? (
            <Link to={`/messenger/chat/${chatId}/manage/media`} className="pcp-more">
              <span>Показать всё</span>
              <LuChevronRight size={18} aria-hidden />
            </Link>
          ) : null}
        </section>
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

function TabBtn({
  active,
  onClick,
  label,
  count,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  loading: boolean;
}) {
  return (
    <button type="button" role="tab" aria-selected={active} className={['pcp-tab', active ? 'pcp-tab--active' : ''].join(' ')} onClick={onClick}>
      <span>{label}</span>
      {!loading ? <span className="pcp-tab__count">{count}</span> : null}
    </button>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="pcp-empty-state">
      <span className="pcp-empty-state__icon">{icon}</span>
      <p>{text}</p>
    </div>
  );
}
