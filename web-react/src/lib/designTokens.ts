import type { MantineColorsTuple } from '@mantine/core';

/**
 * Design tokens — Android mockup palette (Phase 8).
 * Single source for CSS variables, Tailwind theme, and Mantine.
 * Prefer these tokens over hard-coded colors/sizes in components.
 */

/** Wine brand scale for Mantine `brand` (index 5–6 = primary). */
export const BRAND_COLORS: MantineColorsTuple = [
  '#FBF0F3',
  '#F5D6DE',
  '#EBB0C0',
  '#DC7A94',
  '#C94D6E',
  '#8A2742',
  '#5A1826',
  '#4A1420',
  '#3A1018',
  '#230810',
];

export const TYPOGRAPHY = {
  fontFamily: '"Onest", system-ui, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontFamilyAccent: '"Playfair Display", Georgia, "Times New Roman", serif',
  headingsFontFamily: '"Onest", system-ui, sans-serif',
  headingsFontWeight: '800',
} as const;

/** Light (church) theme — leaf / card / ink / wine / gold. */
export const SEMANTIC_COLORS = {
  surface: '#FBF6EF',
  surfaceElevated: '#ffffff',
  text: '#3A1018',
  textSecondary: '#6A5555',
  textMuted: '#6A5555',
  primary: '#8A2742',
  primaryDark: '#5A1826',
  accent: '#F2B879',
  gold: '#F2B879',
  ink: '#3A1018',
  muted: '#6A5555',
  wine: '#8A2742',
  headerBg: '#230810',
  headerOrbWine: '#8A2342',
  headerOrbGold: '#F0A25A',
  btnGradientFrom: '#8A2742',
  btnGradientTo: '#5A1826',
} as const;

/**
 * Musician / stage theme (song, setlists, Perform).
 * Text is warm off-white (#E9E5DD), not pure white — WCAG on #0B0B0D.
 */
export const SEMANTIC_COLORS_MUSICIAN = {
  surface: '#0B0B0D',
  surfaceElevated: '#151518',
  surfaceCard: '#1E1E22',
  text: '#E9E5DD',
  textSecondary: '#938E86',
  textMuted: '#938E86',
  primary: '#E8B35F',
  primaryDark: '#C4923A',
  accent: '#E8B35F',
  border: 'rgba(255, 255, 255, 0.07)',
} as const;

/** Legacy alias used by songbook pages; maps to musician dark surface. */
export const SEMANTIC_COLORS_DARK = {
  surface: SEMANTIC_COLORS_MUSICIAN.surface,
  surfaceElevated: SEMANTIC_COLORS_MUSICIAN.surfaceElevated,
  text: SEMANTIC_COLORS_MUSICIAN.text,
  textSecondary: SEMANTIC_COLORS_MUSICIAN.textSecondary,
  textMuted: SEMANTIC_COLORS_MUSICIAN.textMuted,
  primary: SEMANTIC_COLORS_MUSICIAN.primary,
  primaryDark: SEMANTIC_COLORS_MUSICIAN.primaryDark,
  accent: SEMANTIC_COLORS_MUSICIAN.accent,
} as const;

/** Song reader theme switch: Чёрная / Тёмная / Светлая. */
export type SongThemeId = 'black' | 'dark' | 'light';

export const SONG_THEMES: Record<
  SongThemeId,
  {
    surface: string;
    surfaceElevated: string;
    text: string;
    textMuted: string;
    accent: string;
    border: string;
  }
> = {
  black: {
    surface: '#0B0B0D',
    surfaceElevated: '#151518',
    text: '#E9E5DD',
    textMuted: '#938E86',
    accent: '#E8B35F',
    border: 'rgba(255, 255, 255, 0.07)',
  },
  dark: {
    surface: '#151518',
    surfaceElevated: '#1E1E22',
    text: '#E9E5DD',
    textMuted: '#938E86',
    accent: '#E8B35F',
    border: 'rgba(255, 255, 255, 0.07)',
  },
  light: {
    surface: '#FBF6EF',
    surfaceElevated: '#ffffff',
    text: '#3A1018',
    textMuted: '#6A5555',
    accent: '#8A2742',
    border: 'rgba(58, 16, 24, 0.1)',
  },
} as const;

export const RADII = {
  default: 'md',
  input: 'md',
  button: 'md',
  badge: 'md',
  card: 'lg',
  /** px tokens for CSS / Tailwind */
  chip: 999,
  cardPx: 18,
  cardLgPx: 20,
  leafTopPx: 30,
  pill: 999,
} as const;

export const SIZES = {
  /** Bottom tab bar content height (mockup); + safe-area separately. */
  bottomNavBarPx: 84,
  /** White leaf overlap onto dark header. */
  leafOverlapPx: 88,
  headerTitlePx: 23,
  headerSubtitlePx: 12.5,
  headerBtnPx: 36,
  buttonMinH: 50,
  buttonMaxH: 58,
  fieldMinH: 46,
  fieldMaxH: 52,
  listRowMinH: 42,
  listRowMaxH: 64,
  fabPx: 56,
} as const;

export const SHADOWS = {
  card: '0 2px 16px rgba(58, 16, 24, 0.06)',
  cardHover: '0 8px 28px rgba(58, 16, 24, 0.1)',
  nav: '0 -8px 32px rgba(58, 16, 24, 0.09), 0 4px 16px rgba(58, 16, 24, 0.04)',
  btn: '0 8px 20px rgba(138, 39, 66, 0.28)',
  sheet: '0 -12px 40px rgba(35, 8, 16, 0.18)',
} as const;

export const COMPONENT_TOKENS = {
  cardShadow: 'xs',
  cardWithBorder: true,
  navLinkVariant: 'subtle',
  tableStriped: true,
  tableHighlightOnHover: true,
} as const;
