import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LuEllipsis, LuX } from 'react-icons/lu';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  showMore?: boolean;
};

export function BibleSheetShell({ open, title, onClose, children, footer, showMore = false }: Props) {
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

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-stone-950/45 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[min(88dvh,44rem)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700"
          >
            <LuX size={20} />
          </button>
          <h2 className="text-[17px] font-bold text-stone-900">{title}</h2>
          {showMore ? (
            <button
              type="button"
              aria-label="Ещё"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-700"
            >
              <LuEllipsis size={18} />
            </button>
          ) : (
            <span className="inline-flex h-10 w-10" />
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? <div className="border-t border-stone-100 px-4 py-3">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
