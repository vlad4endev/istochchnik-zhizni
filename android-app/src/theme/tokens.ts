/**
 * Design tokens ported from web-react/src/lib/designTokens.ts and tailwind.config.js
 */
export const colors = {
  primary: '#7d3640',
  primaryDark: '#5c2830',
  surface: '#f4f1ed',
  surfaceDark: '#1c1917',
  text: '#1c1917',
  textMuted: '#78716c',
  white: '#ffffff',
  error: '#dc2626',
  border: '#e7e5e4',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const typography = {
  fontFamily: 'System',
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 22,
    '2xl': 28,
  },
} as const;
