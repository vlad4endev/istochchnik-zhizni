import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type AppBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Extra class on the panel. */
  className?: string;
};

/** Bottom sheet with scrim; respects safe-area / Android gesture bar. */
export function AppBottomSheet({ open, onClose, title, children, className = '' }: AppBottomSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal,400)] flex flex-col justify-end" role="presentation">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-[rgba(35,8,16,0.45)] backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={[
          'relative z-[1] max-h-[min(88dvh,720px)] w-full overflow-auto rounded-t-leaf bg-card shadow-sheet',
          'pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-2',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[color:var(--border-hover)]" aria-hidden />
        {title ? (
          <h2 id={titleId} className="px-4 pb-2 font-ui text-[18px] font-extrabold text-ink">
            {title}
          </h2>
        ) : null}
        <div className="px-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
