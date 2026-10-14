import type { ReactNode } from 'react';
import { LuChevronLeft } from 'react-icons/lu';

export type AppHeaderProps = {
  title: string;
  /** One line; must not clip — use ellipsis only as last resort. */
  subtitle?: string;
  /** Back button (36px). */
  onBack?: () => void;
  backAriaLabel?: string;
  /** Right-side actions (36×36 buttons). */
  actions?: ReactNode;
  /** Extra content inside the dark band (below title row). */
  children?: ReactNode;
  className?: string;
  /** When false, skip dark band orbs/grain (compact nested headers). */
  band?: boolean;
};

/**
 * Compact section header: dark band + title 23/800 + subtitle 12.5 + 36px buttons.
 * Pair with `<AppLeaf>` so the white sheet overlaps by `--size-leaf-overlap`.
 */
export function AppHeader({
  title,
  subtitle,
  onBack,
  backAriaLabel = 'Назад',
  actions,
  children,
  className = '',
  band = true,
}: AppHeaderProps) {
  const inner = (
    <div className="flex w-full flex-col gap-1 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
      <div className="flex min-h-9 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={backAriaLabel}
            className="grid h-header-btn w-header-btn shrink-0 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/16 active:bg-white/20"
          >
            <LuChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-ui text-header-title text-white">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 truncate font-ui text-header-sub text-white/75">{subtitle}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5 [&_button]:grid [&_button]:h-header-btn [&_button]:w-header-btn [&_button]:place-items-center [&_button]:rounded-full [&_button]:bg-white/10 [&_button]:text-white">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );

  if (!band) {
    return <header className={`w-full ${className}`.trim()}>{inner}</header>;
  }

  return (
    <header className={`app-header-band w-full ${className}`.trim()}>
      <span className="app-header-band__orb app-header-band__orb--wine" aria-hidden />
      <span className="app-header-band__orb app-header-band__orb--gold" aria-hidden />
      <span className="app-header-band__grain" aria-hidden />
      {inner}
    </header>
  );
}
