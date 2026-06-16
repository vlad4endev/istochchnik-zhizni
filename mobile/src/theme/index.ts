import { useColorScheme } from 'react-native';
import { useMemo } from 'react';

import { getColorScheme } from '../lib/storage';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textOnPrimary: string;
  member: string;
  theme: string;
  ministry: string;
  backslider: string;
  radius: number;
}

const lightColors: ThemeColors = {
  primary: '#7d3640',
  primaryDark: '#5c2830',
  surface: '#f4f1ed',
  surfaceElevated: '#ffffff',
  text: '#1c1917',
  textSecondary: '#57534e',
  textMuted: '#a8a29e',
  textOnPrimary: '#ffffff',
  member: '#6366f1',
  theme: '#0d9488',
  ministry: '#ea580c',
  backslider: '#be185d',
  radius: 16,
};

const darkColors: ThemeColors = {
  primary: '#d97787',
  primaryDark: '#b85c6c',
  surface: '#1c1917',
  surfaceElevated: '#292524',
  text: '#fafaf9',
  textSecondary: '#d6d3d1',
  textMuted: '#a8a29e',
  textOnPrimary: '#1c1917',
  member: '#6366f1',
  theme: '#0d9488',
  ministry: '#ea580c',
  backslider: '#be185d',
  radius: 16,
};

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

export function useTheme(): Theme {
  const systemScheme = useColorScheme();
  const preference = getColorScheme();

  const isDark = useMemo(() => {
    if (preference === 'dark') return true;
    if (preference === 'light') return false;
    return systemScheme === 'dark';
  }, [preference, systemScheme]);

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
  };
}
