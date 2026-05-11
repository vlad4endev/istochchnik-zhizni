/** Липкая полоса под шапкой — без горизонтального inset, чтобы `PageHeader` был во всю ширину экрана */
export const sectionHeroStickyClass =
  '[position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80';

/** То же без горизонтального px — внутри уже ограниченной колонки (дашборд) */
export const sectionHeroStickyClassNested =
  '[position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80';
