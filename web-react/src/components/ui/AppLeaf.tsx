import type { ReactNode } from 'react';

export type AppLeafProps = {
  children: ReactNode;
  className?: string;
  /** Disable negative margin overlap (e.g. nested sheets). */
  overlap?: boolean;
};

/** Rounded top content sheet that rises onto the dark header. */
export function AppLeaf({ children, className = '', overlap = true }: AppLeafProps) {
  return (
    <div
      className={[
        'app-leaf relative z-[2] min-h-0 flex-1 bg-leaf',
        overlap ? '' : '!mt-0',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
