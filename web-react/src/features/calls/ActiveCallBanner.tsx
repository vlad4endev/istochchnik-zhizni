import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { IcPhone, IcVideo } from './callIcons';
import { useCallStore } from './callStore';
import { formatCallDuration, useCallElapsedSeconds } from './callTime';
import { MinimizedCallActions } from './MinimizedCallActions';
import styles from './ActiveCallBanner.module.css';

let visibleBanners = 0;

/** Пока плашка на экране, плавающая панель звонка скрыта (CSS по `data-call-banner`) — иначе две панели про одно и то же. */
function useHideFloatingBar(visible: boolean) {
  useEffect(() => {
    if (!visible) return undefined;
    visibleBanners += 1;
    document.documentElement.setAttribute('data-call-banner', '1');
    return () => {
      visibleBanners -= 1;
      if (visibleBanners <= 0) {
        visibleBanners = 0;
        document.documentElement.removeAttribute('data-call-banner');
      }
    };
  }, [visible]);
}

/**
 * Плашка над списком чатов, пока звонок/встреча свёрнуты: тап возвращает в звонок,
 * справа — микрофон и завершение. Можно выйти в чат (вставить ссылку, написать сообщение),
 * не завершая встречу.
 */
export function ActiveCallBanner() {
  const navigate = useNavigate();
  const activeCall = useCallStore((s) => s.activeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
  const isMuted = useCallStore((s) => s.isMuted);
  const controls = useCallStore((s) => s.minimizedControls);
  const expandCall = useCallStore((s) => s.expandCall);

  const visible =
    Boolean(activeCall) &&
    uiMinimized &&
    activeCall!.status !== 'ended' &&
    activeCall!.status !== 'ringing_in';

  useHideFloatingBar(visible && Boolean(controls));
  const elapsed = useCallElapsedSeconds(activeCall?.startedAt, visible);

  const onReturn = useCallback(() => {
    const call = useCallStore.getState().activeCall;
    if (!call) return;
    expandCall();
    void navigate(`/call/${encodeURIComponent(call.callId)}`);
  }, [expandCall, navigate]);

  if (!visible || !activeCall) return null;

  const title =
    activeCall.peerName?.trim() || (activeCall.callKind === 'group' ? 'Встреча' : 'Звонок');
  const isConnecting = activeCall.status === 'calling';
  const subtitle = isConnecting ? 'Соединение…' : formatCallDuration(elapsed);

  return (
    <div className={styles.banner} role="region" aria-label="Активный звонок">
      <button
        type="button"
        className={styles.main}
        onClick={onReturn}
        aria-label={`Вернуться в звонок: ${title}`}
      >
        <span className={styles.icon} aria-hidden>
          {activeCall.callType === 'video' ? <IcVideo size={20} /> : <IcPhone size={20} />}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          <span className={styles.subtitle}>
            <span className={styles.dot} aria-hidden />
            <span className={styles.time}>{subtitle}</span>
            <span className={styles.tap}>· нажмите, чтобы вернуться</span>
          </span>
        </span>
      </button>
      {controls ? (
        <MinimizedCallActions
          controls={controls}
          isMuted={isMuted}
          tone="light"
          hangupLabel={isConnecting ? 'Отменить вызов' : 'Завершить звонок'}
        />
      ) : null}
    </div>
  );
}
