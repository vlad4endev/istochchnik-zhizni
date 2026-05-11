import { LuArrowUpRight, LuPlay } from 'react-icons/lu';

import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';

type VideoLink = { title: string; url: string; subtitle?: string };

const VIDEO_LINKS: VideoLink[] = [
  { title: 'YouTube', url: 'https://www.youtube.com/', subtitle: 'Канал/плейлисты (укажите реальную ссылку)' },
  { title: 'VK Video', url: 'https://vk.com/video', subtitle: 'Записи и клипы (укажите реальную ссылку)' },
];

export function VideosPage() {
  return (
    <div className="min-h-full bg-[var(--surface)] max-lg:pb-0 lg:pb-8">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Видео" />
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

