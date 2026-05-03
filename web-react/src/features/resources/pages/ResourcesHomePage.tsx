import { Link } from 'react-router-dom';
import { LuBookOpen, LuHeadphones, LuPlay } from 'react-icons/lu';

import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';

function Tile({
  to,
  title,
  description,
  Icon,
}: {
  to: string;
  title: string;
  description: string;
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] px-5 py-5 shadow-[var(--shadow-card)] transition hover:translate-y-[-1px] hover:shadow-[var(--shadow)]"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600 transition group-hover:bg-primary/10 group-hover:text-primary">
        <Icon size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold text-stone-900 sm:text-base">{title}</p>
        <p className="mt-1 text-sm font-medium leading-snug text-stone-600">{description}</p>
      </div>
      <span className="mt-1 text-stone-400 transition group-hover:text-primary">→</span>
    </Link>
  );
}

export function ResourcesHomePage() {
  return (
    <div className="min-h-full bg-[var(--surface)] max-lg:pb-0 lg:pb-8">
      <div className={sectionHeroStickyClass}>
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
                Ресурсы
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
                Подкасты, видео и материалы для чтения.
              </p>
            </div>
            <SectionHeroToolbarEnd />
          </div>
        </header>
      </div>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3 sm:gap-4 md:max-w-xl lg:max-w-3xl">
          <Tile
            to="/resources/podcasts"
            title="Подкасты"
            description="Слушайте выпуски из RSS‑ленты."
            Icon={LuHeadphones}
          />
          <Tile to="/resources/video" title="Видео" description="Ссылки на трансляции и записи." Icon={LuPlay} />
          <Tile to="/resources/read" title="Читать" description="Статьи, конспекты и полезные материалы." Icon={LuBookOpen} />
        </div>
      </div>
    </div>
  );
}

