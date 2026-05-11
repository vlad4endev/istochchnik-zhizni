import { Link } from 'react-router-dom';
import { LuBookOpen, LuHeadphones, LuPlay } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';

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
        <PageHeader title="Ресурсы" />
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

