import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

export type SectionHeroChromeProps = {
  title: string;
  subtitle?: string;
  /** Обёртка липкой полосы (по умолчанию — как у ресурсов / молитвы) */
  stickyClassName?: string;
};

export function SectionHeroChrome({ title, subtitle, stickyClassName }: SectionHeroChromeProps) {
  const sticky = stickyClassName ?? sectionHeroStickyClass;
  return (
    <div className={sticky}>
      <PageHeader title={title} subtitle={subtitle} />
    </div>
  );
}
