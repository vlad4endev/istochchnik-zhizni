import { Link } from 'react-router-dom';
import { LuBookOpen, LuHeadphones, LuPlay } from 'react-icons/lu';

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
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <div className="sticky top-0 z-40 pb-2 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80">
        <header className="relative overflow-hidden bg-gradient-to-br from-primary via-[#6d3039] to-primary-dark px-4 py-4 text-white shadow-[0_8px_32px_rgba(92,40,48,0.35)] sm:px-5 sm:py-5 md:px-6 md:py-5 shell:rounded-none">
          <div
            className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl"
            aria-hidden
          />
          <h1 className="relative text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
            Ресурсы
          </h1>
          <p className="relative mt-1 max-w-3xl text-sm text-white/85 md:text-base">
            Подкасты, видео и материалы для чтения.
          </p>
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

