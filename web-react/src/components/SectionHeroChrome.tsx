import type { ReactNode } from 'react';

import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

export type SectionHeroChromeProps = {
  title: string;
  subtitle?: string;
  /** Кнопки слева от меню «Доступность» в правой части шапки */
  actions?: ReactNode;
  /** Обёртка липкой полосы (по умолчанию — как у «Проповедей» / молитвы) */
  stickyClassName?: string;
};

/**
 * Единая градиентная шапка раздела (как DailyPrayerPage / PodcastsPage).
 */
export function SectionHeroChrome({ title, subtitle, actions, stickyClassName }: SectionHeroChromeProps) {
  const sticky = stickyClassName ?? sectionHeroStickyClass;
  return (
    <div className={sticky}>
      <header className={sectionHeroHeaderClass}>
        <div
          className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl"
          aria-hidden
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">{subtitle}</p>
            ) : null}
          </div>
          <SectionHeroToolbarEnd>{actions}</SectionHeroToolbarEnd>
        </div>
      </header>
    </div>
  );
}
