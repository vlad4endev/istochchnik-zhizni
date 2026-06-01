/**
 * Липкая обёртка `PageHeader`: сплошной primary + overflow на скруглении.
 * Без backdrop-filter / полупрозрачного surface — на старых Android WebView при скролле
 * под шапкой появляются горизонтальные артефакты.
 */
const sectionHeroStickyBase =
  'section-hero-sticky [position:-webkit-sticky] sticky top-0 z-20 w-full max-w-full self-start flex-shrink-0 overflow-hidden rounded-b-[20px] bg-primary';

/** Липкая полоса — без горизонтального inset, чтобы `PageHeader` был во всю ширину экрана */
export const sectionHeroStickyClass = sectionHeroStickyBase;

/** То же без горизонтального px — внутри уже ограниченной колонки (дашборд) */
export const sectionHeroStickyClassNested = sectionHeroStickyBase;
