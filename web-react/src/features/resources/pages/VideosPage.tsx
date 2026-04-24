import { Link } from 'react-router-dom';
import { LuArrowUpRight, LuPlay } from 'react-icons/lu';

import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';

type VideoLink = { title: string; url: string; subtitle?: string };

const VIDEO_LINKS: VideoLink[] = [
  { title: 'YouTube', url: 'https://www.youtube.com/', subtitle: 'Канал/плейлисты (укажите реальную ссылку)' },
  { title: 'VK Video', url: 'https://vk.com/video', subtitle: 'Записи и клипы (укажите реальную ссылку)' },
];

export function VideosPage() {
  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
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
                Видео
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">Трансляции и записи.</p>
            </div>
            <SectionHeroToolbarEnd>
              <Link
                to="/resources"
                className="inline-flex h-10 shrink-0 items-center rounded-xl bg-white/15 px-3 text-sm font-extrabold text-white hover:bg-white/20 sm:px-4"
              >
                Назад
              </Link>
            </SectionHeroToolbarEnd>
          </div>
        </header>
      </div>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-lg space-y-3 sm:space-y-4 md:max-w-xl lg:max-w-3xl">
          {VIDEO_LINKS.map((x) => (
            <a
              key={x.url}
              href={x.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] px-5 py-5 shadow-[var(--shadow-card)] transition hover:translate-y-[-1px] hover:shadow-[var(--shadow)]"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600 transition group-hover:bg-primary/10 group-hover:text-primary">
                <LuPlay size={24} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-stone-900 sm:text-base">{x.title}</p>
                {x.subtitle ? <p className="mt-1 text-sm font-medium text-stone-600">{x.subtitle}</p> : null}
              </div>
              <LuArrowUpRight className="mt-1 text-stone-400 transition group-hover:text-primary" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

