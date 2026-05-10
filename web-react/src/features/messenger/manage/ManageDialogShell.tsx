import type { ReactNode } from 'react';

type ManageDialogShellProps = {
  children: ReactNode;
  onClose: () => void;
  zIndexClassName?: string;
  contentClassName?: string;
  backdropClassName?: string;
  align?: 'bottom' | 'center';
};

export function ManageDialogShell({
  children,
  onClose,
  zIndexClassName = 'z-[4000]',
  contentClassName = '',
  backdropClassName = 'bg-black/45 backdrop-blur-[2px] dark:bg-black/55 dark:backdrop-blur-sm',
  align = 'center',
}: ManageDialogShellProps) {
  const alignClass =
    align === 'bottom'
      ? 'items-end justify-center px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:p-4'
      : 'items-center justify-center p-3 sm:p-4';

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} ${alignClass} ${backdropClassName} motion-safe:transition-[backdrop-filter,background-color] motion-safe:duration-200`}
      onClick={onClose}
    >
      <div
        className={[
          'w-full overflow-hidden rounded-3xl bg-[var(--surface-elevated)] shadow-2xl ring-1 ring-stone-200/60',
          'dark:border dark:border-[var(--glass-border)] dark:bg-[rgba(18,18,20,0.88)] dark:ring-white/10 dark:backdrop-blur-2xl',
          contentClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
