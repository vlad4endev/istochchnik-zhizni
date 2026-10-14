import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AppChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  active?: boolean;
};

export function AppChip({ children, active = false, className = '', type = 'button', ...rest }: AppChipProps) {
  return (
    <button
      type={type}
      className={[
        'app-chip tap-highlight-transparent transition-colors',
        active ? 'bg-wine text-white border-transparent' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
