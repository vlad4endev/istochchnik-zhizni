import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type FontSize = 'small' | 'normal' | 'large' | 'xlarge';
type Theme = 'light' | 'dark' | 'sepia' | 'system';

const fontScaleMap: Record<FontSize, number> = {
  small: 0.875,
  normal: 1,
  large: 1.125,
  xlarge: 1.25,
};

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'theme-sepia');

  if (theme === 'dark') root.classList.add('dark');
  else if (theme === 'sepia') root.classList.add('theme-sepia');
  else if (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.classList.add('dark');
  }
}

function applyFontSize(size: FontSize): void {
  document.documentElement.style.setProperty('--a11y-font-scale', String(fontScaleMap[size]));
}

interface AppearanceState {
  theme: Theme;
  fontSize: FontSize;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: FontSize) => void;
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: 'light',
      fontSize: 'normal',
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setFontSize: (size) => {
        applyFontSize(size);
        set({ fontSize: size });
      },
    }),
    { name: 'app-appearance' },
  ),
);

export function initAppearance(): void {
  const stored = localStorage.getItem('app-appearance');
  if (!stored) {
    applyTheme('light');
    applyFontSize('normal');
    return;
  }

  try {
    const parsed = JSON.parse(stored) as { state?: { theme?: Theme; fontSize?: FontSize } };
    const theme = parsed.state?.theme ?? 'light';
    const fontSize = parsed.state?.fontSize ?? 'normal';
    applyTheme(theme);
    applyFontSize(fontSize);
  } catch {
    applyTheme('light');
    applyFontSize('normal');
  }
}
