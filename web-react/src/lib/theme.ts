import { createTheme, type MantineColorsTuple } from '@mantine/core';

const brand: MantineColorsTuple = [
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

export const theme = createTheme({
  primaryColor: 'brand',
  colors: { brand },
  defaultRadius: 'sm',
  fontFamily: 'Inter, sans-serif',
  fontFamilyMonospace: 'monospace',
  headings: {
    fontFamily: 'Inter, sans-serif',
    fontWeight: '600',
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
