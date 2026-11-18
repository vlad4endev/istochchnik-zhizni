import { useEffect, useRef, useState } from 'react';

import { setAppToastInterceptor, type AppToastKind } from '../../lib/uiFeedback';

type CallToast = { id: number; message: string; kind: AppToastKind };

const DEFAULT_DURATION_MS = 4200;
const MAX_VISIBLE = 2;

/**
 * Уведомления поверх развёрнутого окна звонка. Глобальный AppToastHost — модальный и лежит
 * под окном звонка (z-index), поэтому во время звонка тосты не были видны и всплывали
 * пачкой после него. Здесь — ненавязчивая плашка, не перекрывающая кнопки управления.
 */
export function CallToastLayer() {
  const [items, setItems] = useState<CallToast[]>([]);
  const timers = useRef(new Map<number, number>());
  const seq = useRef(0);
  const itemsRef = useRef<CallToast[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    const timerMap = timers.current;
    const remove = (id: number) => {
      const t = timerMap.get(id);
      if (t != null) window.clearTimeout(t);
      timerMap.delete(id);
      setItems((cur) => cur.filter((x) => x.id !== id));
    };
    const off = setAppToastInterceptor((payload) => {
      // Тосты с действием («Отменить» и т.п.) оставляем глобальному хосту.
      if (payload.action) return false;
      const id = (seq.current += 1);
      const kind = payload.kind ?? 'error';
      // Повтор того же текста не плодим — заменяем (показ продлевается).
      for (const x of itemsRef.current) {
        if (x.message !== payload.message) continue;
        const t = timerMap.get(x.id);
        if (t != null) window.clearTimeout(t);
        timerMap.delete(x.id);
      }
      setItems((cur) =>
        [...cur.filter((x) => x.message !== payload.message), { id, message: payload.message, kind }].slice(
          -MAX_VISIBLE,
        ),
      );
      timerMap.set(
        id,
        window.setTimeout(() => remove(id), payload.durationMs ?? DEFAULT_DURATION_MS),
      );
      return true;
    });
    return () => {
      off();
      for (const t of timerMap.values()) window.clearTimeout(t);
      timerMap.clear();
    };
  }, []);

  return (
    <div className="call-toast-layer" aria-live="polite">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          role={t.kind === 'error' ? 'alert' : 'status'}
          className={`call-toast call-toast--${t.kind}`}
          onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
          aria-label={`${t.message}. Нажмите, чтобы скрыть`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
