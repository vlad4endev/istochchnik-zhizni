import type { MantineColorsTuple } from '@mantine/core';

/**
 * Shared design tokens for Mantine theme and global styles.
 * Keep values unchanged unless product design update is intended.
 */
export const BRAND_COLORS: MantineColorsTuple = [
  '#eef2ff',
  '#dbe4ff',
  '#bac8ff',
  '#91a7ff',
  '#748ffc',
  '#5c7cfa',
  '#4c6ef5',
  '#4263eb',
  '#3b5bdb',
  '#364fc7',
];

export const TYPOGRAPHY = {
  fontFamily: 'Inter, sans-serif',
  fontFamilyMonospace: 'monospace',
  headingsFontFamily: 'Inter, sans-serif',
  headingsFontWeight: '600',
} as const;

/**
 * Radius tokens mirror current defaults from the app theme.
 * They are intentionally conservative to avoid visual regressions.
 */
export const RADII = {
  default: 'sm',
  input: 'sm',
  button: 'sm',
  badge: 'sm',
  card: 'md',
} as const;

/**
 * Component-level tokens for low-risk Mantine defaults.
 */
export const COMPONENT_TOKENS = {
  cardShadow: 'xs',
  cardWithBorder: true,
  navLinkVariant: 'subtle',
  tableStriped: true,
  tableHighlightOnHover: true,
} as const;

/**
 * Semantic palette contract for future screen-by-screen migration.
 * This does not change existing screen styles by itself.
 */
export const SEMANTIC_COLORS = {
  surface: '#f4f1ed',
  surfaceElevated: '#ffffff',
  text: '#1c1917',
  textSecondary: '#57534e',
  textMuted: '#a8a29e',
  primary: '#7d3640',
  primaryDark: '#5c2830',
  accent: '#dc2626',
} as const;

/**
 * Semantic palette for dark contexts (aligned with current globals).
 */
export const SEMANTIC_COLORS_DARK = {
  surface: '#0a0a0b',
  surfaceElevated: '#18181c',
  text: '#f0eff4',
  textSecondary: '#9896a4',
  textMuted: '#55535f',
  primary: '#c0415a',
  primaryDark: '#a8304a',
  accent: '#f87171',
} as const;
