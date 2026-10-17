import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';

import './appSheet.css';

const CLOSE_MS = 220;
const DRAG_CLOSE_PX = 110;

/**
 * Нижний лист (bottom sheet) для модальных окон: на телефоне выезжает снизу поверх нижней панели
 * (ручка, свайп вниз закрывает, отступ под home indicator), на планшете и ПК — по центру.
 * На iOS — «стекло» и крупные радиусы, на Android — плотнее и ближе к Material. Тему берёт из переменных приложения.
 */
export function AppSheet({
  title,
  subtitle,
  icon,
  onClose,
  size = 'md',
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  size?: 'md' | 'wide';
  children: ReactNode;
}) {
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<{ y: number; t: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setClosing((prev) => {
      if (prev) return prev;
      window.setTimeout(onClose, CLOSE_MS);
      return true;
    });
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = { y: e.clientY, t: Date.now() };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    setDragY(Math.max(0, e.clientY - s.y));
  };
  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    dragStartRef.current = null;
    if (!s) return;
    const dy = Math.max(0, e.clientY - s.y);
    const fast = dy > 40 && Date.now() - s.t < 220;
    if (dy > DRAG_CLOSE_PX || fast) close();
    else setDragY(0);
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={['app-sheet-root', closing ? 'app-sheet-root--closing' : ''].join(' ')}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={['app-sheet', size === 'wide' ? 'app-sheet--wide' : ''].join(' ')}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="app-sheet__head"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <span className="app-sheet__grabber" aria-hidden />
          <div className="app-sheet__bar">
            {icon ? <span className="app-sheet__icon">{icon}</span> : null}
            <div className="app-sheet__titles">
              <h2 id={titleId} className="app-sheet__title">{title}</h2>
              {subtitle ? <p className="app-sheet__subtitle">{subtitle}</p> : null}
            </div>
            <button type="button" className="app-sheet__close" onClick={close} aria-label="Закрыть">
              <LuX size={18} strokeWidth={2.4} aria-hidden />
            </button>
          </div>
        </div>
        <div className="app-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
