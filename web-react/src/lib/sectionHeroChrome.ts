/**
 * Единый «герой»‑хедер разделов (градиентная панель): форма, отступы, липкий фон.
 * Верхний отступ учитывает env(safe-area-inset-top) для PWA / iPhone.
 */

/** Липкая полоса под скруглённую карточку — страницы без внешнего px у корня */
export const sectionHeroStickyClass =
  'flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80 px-3 pt-[max(0.5rem,var(--app-safe-top))] pb-2 sm:px-4 sm:pt-[max(0.75rem,var(--app-safe-top))] shell:px-6 md:px-6 lg:px-8 xl:px-10';

/** То же без горизонтального px — внутри уже ограниченной колонки (дашборд) */
export const sectionHeroStickyClassNested =
  'flex-shrink-0 bg-[var(--surface)]/95 shadow-[0_4px_16px_rgba(0,0,0,0.02)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/80 pt-[max(0.5rem,var(--app-safe-top))] pb-2 sm:pt-[max(0.75rem,var(--app-safe-top))]';

export const sectionHeroHeaderClass =
  'relative min-h-[98px] overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#6d3039] to-primary-dark px-4 py-4 text-white shadow-[0_8px_32px_rgba(92,40,48,0.35)] sm:min-h-[108px] sm:px-5 sm:py-5 md:px-6 md:py-5 shell:rounded-none';
