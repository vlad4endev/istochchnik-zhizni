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
  backdropClassName = 'bg-black/40',
  align = 'bottom',
}: ManageDialogShellProps) {
  const alignClass =
    align === 'center' ? 'items-center justify-center p-3' : 'items-end justify-center p-3';

  return (
    <div className={`fixed inset-0 ${zIndexClassName} ${alignClass} ${backdropClassName}`} onClick={onClose}>
      <div
        className={[
          'w-full overflow-hidden rounded-3xl bg-[var(--surface-elevated)] shadow-2xl ring-1 ring-black/5',
          'dark:border dark:border-[var(--glass-border)] dark:bg-[rgba(18,18,20,0.85)] dark:backdrop-blur-2xl',
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
