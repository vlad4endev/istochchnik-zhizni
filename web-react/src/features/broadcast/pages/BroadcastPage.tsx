import { LuTv } from 'react-icons/lu';

export function BroadcastPage() {
  return (
    <div className="min-h-full bg-[var(--surface)] pb-6 shell:pb-8">
      <header className="bg-primary px-4 py-4 text-white shadow-[0_4px_24px_rgba(125,54,64,0.3)] sm:px-5 sm:py-5 md:rounded-none md:shadow-sm md:px-6 max-md:rounded-b-[1.75rem]">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl md:text-3xl">Трансляции</h1>
        <p className="mt-1 max-w-3xl text-sm text-white/85 md:text-base">
          Смотрите наши богослужения и мероприятия в прямом эфире
        </p>
      </header>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6 sm:gap-8 md:max-w-xl lg:max-w-4xl xl:max-w-6xl">
          <section
            className="rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)] lg:p-8 shell:p-8"
            aria-labelledby="broadcast-heading"
          >
            <h2
              id="broadcast-heading"
              className="flex flex-col sm:flex-row sm:items-center gap-3 text-base font-extrabold text-stone-900 sm:text-lg md:text-xl mb-4"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/[0.08] text-primary/80 shrink-0">
                <LuTv className="h-6 w-6" strokeWidth={2} aria-hidden />
              </div>
              <span className="leading-tight">Прямой эфир</span>
            </h2>
            
            <p className="mb-6 text-sm text-stone-500 max-w-2xl leading-relaxed">
              Трансляция богослужения доступна онлайн. Подключайтесь к нам из любой точки мира.
            </p>

            {/* Rutube Placeholder / Embed Container */}
            <div className="relative w-full overflow-hidden rounded-2xl bg-stone-900 shadow-xl border border-stone-800" style={{ paddingTop: '56.25%' }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-stone-400 p-6 text-center bg-stone-950/50">
                <LuTv className="h-12 w-12 mb-4 opacity-50" strokeWidth={1} />
                <p className="text-sm font-medium">Трансляция Rutube</p>
                <p className="text-xs opacity-70 mt-1 max-w-xs">Код плеера будет добавлен сюда</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
