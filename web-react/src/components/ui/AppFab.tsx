import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AppFabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  /** Offset above bottom nav (default uses nav total height). */
  aboveNav?: boolean;
};

export function AppFab({
  children,
  className = '',
  aboveNav = true,
  type = 'button',
  ...rest
}: AppFabProps) {
  return (
    <button
      type={type}
      className={[
        'fixed right-4 z-[var(--z-sticky,200)] grid h-[var(--size-fab,56px)] w-[var(--size-fab,56px)] place-items-center rounded-full text-white shadow-btn tap-highlight-transparent [background:var(--btn-gradient)]',
        aboveNav
          ? 'bottom-[calc(var(--app-bottom-nav-total-height)+0.75rem)]'
          : 'bottom-[max(1rem,env(safe-area-inset-bottom,0px))]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
