import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type FontSize = 'small' | 'normal' | 'large' | 'xlarge';
export type AppearanceTheme = 'light' | 'dark' | 'sepia' | 'system';
type Theme = AppearanceTheme;

const fontScaleMap: Record<FontSize, number> = {
  small: 0.875,
  normal: 1,
  large: 1.125,
  xlarge: 1.25,
};

const A11Y_STORAGE_KEY = 'istoch-life-a11y-v1';

function readA11yDarkLike(): boolean {
  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { colorTheme?: string };
    return (
      parsed.colorTheme === 'dark' ||
      parsed.colorTheme === 'high-contrast' ||
      parsed.colorTheme === 'blue'
    );
  } catch {
    return false;
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  // AccessibilityProvider owns data-color-theme + dark class after mount.
  // On boot / rare appearance-only paths, keep html.dark aligned.
  root.classList.remove('dark', 'theme-sepia');

  if (theme === 'dark') {
    root.classList.add('dark');
    if (!root.getAttribute('data-color-theme')) {
      root.setAttribute('data-color-theme', 'dark');
    }
  } else if (theme === 'sepia') {
    root.classList.add('theme-sepia');
    root.removeAttribute('data-color-theme');
  } else if (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    root.classList.add('dark');
    if (!root.getAttribute('data-color-theme')) {
      root.setAttribute('data-color-theme', 'dark');
    }
  } else {
    root.removeAttribute('data-color-theme');
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
  else if (root.classList.contains('dark')) content = '#121214';

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

const MANTINE_COLOR_SCHEME_STORAGE_KEY = 'mantine-color-scheme-value';

export function initAppearance(): void {
  try {
    localStorage.removeItem(MANTINE_COLOR_SCHEME_STORAGE_KEY);
  } catch {
    /* ignore */
  }

  // A11y color theme wins on boot to avoid light flash when user chose dark in settings.
  if (readA11yDarkLike()) {
    try {
      const stored = localStorage.getItem('app-appearance');
      const parsed = stored
        ? (JSON.parse(stored) as { state?: { fontSize?: FontSize } })
        : null;
      const fontSize = parsed?.state?.fontSize ?? 'normal';
      useAppearanceStore.setState({ theme: 'dark', fontSize });
      applyTheme('dark');
      applyFontSize(fontSize);
      return;
    } catch {
      useAppearanceStore.setState({ theme: 'dark', fontSize: 'normal' });
      applyTheme('dark');
      applyFontSize('normal');
      return;
    }
  }

  try {
    const stored = localStorage.getItem('app-appearance');
    if (!stored) {
      useAppearanceStore.setState({ theme: 'light', fontSize: 'normal' });
      applyTheme('light');
      applyFontSize('normal');
      return;
    }

    try {
      const parsed = JSON.parse(stored) as { state?: { theme?: Theme; fontSize?: FontSize } };
      const theme = parsed.state?.theme ?? 'light';
      const fontSize = parsed.state?.fontSize ?? 'normal';
      useAppearanceStore.setState({ theme, fontSize });
      applyTheme(theme);
      applyFontSize(fontSize);
    } catch {
      useAppearanceStore.setState({ theme: 'light', fontSize: 'normal' });
      applyTheme('light');
      applyFontSize('normal');
    }
  } catch {
    useAppearanceStore.setState({ theme: 'light', fontSize: 'normal' });
    applyTheme('light');
    applyFontSize('normal');
  }
}
