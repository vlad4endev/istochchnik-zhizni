import { useEffect, useState } from 'react';

import { IcHangup, IcMic, IcMicOff } from './callIcons';
import type { MinimizedCallControls } from './callStore';
import styles from './MinimizedCallActions.module.css';

const ARM_TIMEOUT_MS = 3000;

/**
 * Микрофон и «завершить» для свёрнутого звонка. Завершение — в два нажатия: рядом с
 * полем ввода и ссылкой случайный тап не должен обрывать встречу.
 */
export function MinimizedCallActions({
  controls,
  isMuted,
  tone,
  hangupLabel = 'Завершить звонок',
}: {
  controls: MinimizedCallControls;
  isMuted: boolean;
  tone: 'dark' | 'light';
  hangupLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return undefined;
    const id = window.setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [armed]);

  return (
    <div className={[styles.actions, tone === 'light' ? styles.light : styles.dark].join(' ')}>
      {controls.toggleMic && !armed ? (
        <button
          type="button"
          className={[styles.btn, isMuted ? styles.warn : ''].filter(Boolean).join(' ')}
          onClick={(e) => {
            e.stopPropagation();
            controls.toggleMic?.();
          }}
          disabled={controls.micBusy}
          aria-label={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
          aria-pressed={isMuted}
        >
          {isMuted ? <IcMicOff size={20} /> : <IcMic size={20} />}
        </button>
      ) : null}
      <button
        type="button"
        className={[styles.btn, styles.hangup, armed ? styles.hangupArmed : ''].filter(Boolean).join(' ')}
        onClick={(e) => {
          e.stopPropagation();
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          controls.hangup();
        }}
        aria-label={armed ? `Подтвердить: ${hangupLabel}` : hangupLabel}
      >
        <IcHangup size={20} />
        {armed ? <span className={styles.hangupText}>Завершить?</span> : null}
      </button>
    </div>
  );
}
