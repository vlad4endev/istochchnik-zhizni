import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type AppButtonVariant = 'primary' | 'ghost';

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: AppButtonVariant;
  fullWidth?: boolean;
};

export function AppButton({
  children,
  variant = 'primary',
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}: AppButtonProps) {
  const base = variant === 'primary' ? 'app-btn-primary' : 'app-btn-ghost';
  return (
    <button
      type={type}
      className={[base, fullWidth ? 'w-full' : '', 'tap-highlight-transparent', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
