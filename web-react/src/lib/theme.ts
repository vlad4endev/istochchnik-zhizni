import { createTheme } from '@mantine/core';

import { BRAND_COLORS, COMPONENT_TOKENS, RADII, TYPOGRAPHY } from './designTokens';

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand: BRAND_COLORS },
  defaultRadius: RADII.default,
  fontFamily: TYPOGRAPHY.fontFamily,
  fontFamilyMonospace: TYPOGRAPHY.fontFamilyMonospace,
  headings: {
    fontFamily: TYPOGRAPHY.headingsFontFamily,
    fontWeight: TYPOGRAPHY.headingsFontWeight,
  },
  components: {
    Button: { defaultProps: { radius: RADII.button } },
    TextInput: { defaultProps: { radius: RADII.input } },
    Select: { defaultProps: { radius: RADII.input } },
    Card: {
      defaultProps: {
        radius: RADII.card,
        shadow: COMPONENT_TOKENS.cardShadow,
        withBorder: COMPONENT_TOKENS.cardWithBorder,
      },
    },
    Table: {
      defaultProps: {
        striped: COMPONENT_TOKENS.tableStriped,
        highlightOnHover: COMPONENT_TOKENS.tableHighlightOnHover,
      },
    },
    Badge: { defaultProps: { radius: RADII.badge } },
    NavLink: { defaultProps: { variant: COMPONENT_TOKENS.navLinkVariant } },
  },
});
