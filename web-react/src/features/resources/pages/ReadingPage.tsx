import { Link } from 'react-router-dom';
import { LuArrowUpRight, LuBookOpen } from 'react-icons/lu';

type ReadLink = { title: string; url: string; subtitle?: string };

const READ_LINKS: ReadLink[] = [
  { title: 'Статьи', url: 'https://example.com', subtitle: 'Подборка материалов (укажите реальную ссылку)' },
  { title: 'Конспекты', url: 'https://example.com', subtitle: 'PDF/документы (укажите реальную ссылку)' },
];

export function ReadingPage() {
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
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-[26px] animate-prayer-fade-up motion-reduce:animate-none">
                Читать
              </h1>
              <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">Материалы и ссылки.</p>
            </div>
            <Link
              to="/resources"
              className="inline-flex h-10 items-center rounded-xl bg-white/15 px-4 text-sm font-extrabold text-white hover:bg-white/20"
            >
              Назад
            </Link>
          </div>
        </header>
      </div>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto w-full max-w-lg space-y-3 sm:space-y-4 md:max-w-xl lg:max-w-3xl">
          {READ_LINKS.map((x) => (
            <a
              key={x.url + x.title}
              href={x.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-4 rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] px-5 py-5 shadow-[var(--shadow-card)] transition hover:translate-y-[-1px] hover:shadow-[var(--shadow)]"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-100 text-stone-600 transition group-hover:bg-primary/10 group-hover:text-primary">
                <LuBookOpen size={24} />
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

