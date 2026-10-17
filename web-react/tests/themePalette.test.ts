import { describe, expect, it } from 'vitest';
import colors from 'tailwindcss/colors.js';

import { HUES, themePalettePlugin } from '../tailwind.palette.js';

type BaseRules = Record<string, Record<string, string>>;

function collectBase(): BaseRules {
  let rules: BaseRules = {};
  themePalettePlugin({ addBase: (r: BaseRules) => (rules = r) } as never);
  return rules;
}

describe('tailwind theme palette', () => {
  const rules = collectBase();
  const light = rules[':root'];

  it('в светлой теме совпадает со стандартной палитрой Tailwind', () => {
    expect(light['--bg-emerald-100']).toBe('209 250 229');
    expect(light['--fg-red-700']).toBe('185 28 28');
    expect(light['--bd-amber-200']).toBe('253 230 138');
    expect(light['--fg-stone-900']).toBe('28 25 23');
  });

  it('в тёмных темах пастельный фон тёмный, а тёмный текст светлый', () => {
    const lum = (rgb: string) => {
      const [r, g, b] = rgb.split(' ').map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    for (const sel of [
      "html[data-color-theme='dark'], html.dark",
      "html[data-color-theme='high-contrast']",
      "html[data-color-theme='blue']",
    ]) {
      const vars = rules[sel];
      for (const hue of HUES) {
        expect(lum(vars[`--bg-${hue}-100`]), `${sel} bg ${hue}`).toBeLessThan(0.35);
        expect(lum(vars[`--fg-${hue}-700`]), `${sel} fg ${hue}`).toBeGreaterThan(0.45);
      }
    }
  });

  it('переменные объявлены для каждого оттенка', () => {
    for (const hue of HUES) {
      expect(colors).toHaveProperty(hue);
      expect(light).toHaveProperty(`--bg-${hue}-50`);
    }
  });
});
