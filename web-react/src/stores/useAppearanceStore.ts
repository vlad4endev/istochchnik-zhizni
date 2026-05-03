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
  syncThemeColorMeta();
}

function applyFontSize(size: FontSize): void {
  document.documentElement.style.setProperty('--a11y-font-scale', String(fontScaleMap[size]));
}

/** Статус-бар / оформление Chrome: последний `theme-color` в head перекрывает статичные meta с media. */
function syncThemeColorMeta(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  let content = '#7d3640';
  if (root.classList.contains('theme-sepia')) content = '#5c4330';
  else if (root.classList.contains('dark')) content = '#0a0a0b';

  let meta = document.querySelector('meta[name="theme-color"][data-app-managed="true"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('data-app-managed', 'true');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
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
