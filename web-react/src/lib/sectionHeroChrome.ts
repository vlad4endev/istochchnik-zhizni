/**
 * Липкая обёртка `PageHeader`.
 *
 * НЕ используем overflow-hidden + border-radius на sticky-контейнере:
 * на Android WebView это вызывает горизонтальные артефакты при скролле
 * из-за некорректной GPU-компоновки слоёв. Скругление вместо этого
 * применяется напрямую к header-элементу внутри PageHeader.
 */
const sectionHeroStickyBase =
  'section-hero-sticky [position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0';

/** Липкая полоса — без горизонтального inset, чтобы `PageHeader` был во всю ширину экрана */
export const sectionHeroStickyClass = sectionHeroStickyBase;

/** То же без горизонтального px — внутри уже ограниченной колонки (дашборд) */
export const sectionHeroStickyClassNested = sectionHeroStickyBase;
