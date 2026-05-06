import { createTheme } from '@mantine/core';

import { BRAND_COLORS, TYPOGRAPHY } from './designTokens';

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand: BRAND_COLORS },
  defaultRadius: 'sm',
  fontFamily: TYPOGRAPHY.fontFamily,
  fontFamilyMonospace: TYPOGRAPHY.fontFamilyMonospace,
  headings: {
    fontFamily: TYPOGRAPHY.headingsFontFamily,
    fontWeight: TYPOGRAPHY.headingsFontWeight,
  },
  components: {
    Button: { defaultProps: { radius: 'sm' } },
    TextInput: { defaultProps: { radius: 'sm' } },
    Select: { defaultProps: { radius: 'sm' } },
    Card: { defaultProps: { radius: 'md', shadow: 'xs', withBorder: true } },
    Table: { defaultProps: { striped: true, highlightOnHover: true } },
    Badge: { defaultProps: { radius: 'sm' } },
    NavLink: { defaultProps: { variant: 'subtle' } },
  },
});
