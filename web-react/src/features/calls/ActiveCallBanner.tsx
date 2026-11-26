import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { IcPhone, IcVideo } from './callIcons';
import { useCallStore } from './callStore';
import styles from './ActiveCallBanner.module.css';

export function formatCallDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/**
 * Плашка над списком чатов, пока звонок/встреча свёрнуты: одно нажатие возвращает в звонок.
 * Нужна, чтобы можно было выйти в чат (вставить ссылку, написать сообщение), не завершая встречу.
 */
export function ActiveCallBanner() {
  const navigate = useNavigate();
  const activeCall = useCallStore((s) => s.activeCall);
  const uiMinimized = useCallStore((s) => s.uiMinimized);
  const expandCall = useCallStore((s) => s.expandCall);
  const [now, setNow] = useState(() => Date.now());

  const visible =
    Boolean(activeCall) &&
    uiMinimized &&
    activeCall!.status !== 'ended' &&
    activeCall!.status !== 'ringing_in';

  useEffect(() => {
    if (!visible) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [visible, activeCall?.callId]);

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
  const elapsed = activeCall.startedAt ? (now - activeCall.startedAt) / 1000 : 0;
  const subtitle = isConnecting ? 'Соединение…' : `Идёт ${formatCallDuration(elapsed)}`;

  return (
    <button
      type="button"
      className={styles.banner}
      onClick={onReturn}
      aria-label={`Вернуться в звонок: ${title}`}
    >
      <span className={styles.icon} aria-hidden>
        {activeCall.callType === 'video' ? (
          <IcVideo size={20} strokeWidth={2.2} />
        ) : (
          <IcPhone size={20} strokeWidth={2.2} />
        )}
        <span className={styles.dot} />
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>{subtitle}</span>
      </span>
      <span className={styles.action}>Вернуться</span>
    </button>
  );
}
