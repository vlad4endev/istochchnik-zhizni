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
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Ресурсы</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">Подкасты, видео и материалы для чтения.</p>
      </header>

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

