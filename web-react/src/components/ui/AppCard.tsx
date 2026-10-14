import type { ReactNode } from 'react';

export type AppCardProps = {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'article' | 'section' | 'li';
  onClick?: () => void;
};

export function AppCard({ children, className = '', as: Tag = 'div', onClick }: AppCardProps) {
  return (
    <Tag
      className={['app-card p-4', onClick ? 'cursor-pointer tap-highlight-transparent' : '', className]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}
