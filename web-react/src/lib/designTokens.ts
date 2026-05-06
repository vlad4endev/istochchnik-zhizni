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
