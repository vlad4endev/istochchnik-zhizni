/** Липкая полоса под шапкой — страницы без внешнего px у корня */
export const sectionHeroStickyClass =
  '[position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80 px-3 sm:px-4 shell:px-6 md:px-6 lg:px-8 xl:px-10';

/** То же без горизонтального px — внутри уже ограниченной колонки (дашборд) */
export const sectionHeroStickyClassNested =
  '[position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80';
