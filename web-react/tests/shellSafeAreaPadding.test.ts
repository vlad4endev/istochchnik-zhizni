import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессия «кремовой полосы» под таббаром в iOS Safari/PWA.
 *
 * На скрине iPhone (1170×2532 @3x) пустая полоса снизу была ровно 141 px =
 * 47 pt = safe-area-inset-top. Связанные причины:
 *
 * 1. `body`/`#root { height:100dvh; padding-top: env(safe-area-inset-top) }` при
 *    overflow:hidden укорачивал containing block для `position:fixed` — таббар с
 *    bottom:0 садился выше низа экрана на величину top-inset.
 * 2. `Math.min(visualViewport, innerHeight)` в nativeShellViewport иногда записывал
 *    в --viewport-height значение короче экрана ровно на top-inset.
 * 3. Inline `style="min-height:100dvh;min-height:-webkit-fill-available"` на `#root`
 *    в index.html перекрывал `#root { min-height: 0 }` и на iOS standalone снова
 *    растягивал корень выше рассчитанной viewport-высоты.
 *
 * Инварианты: верхний inset — через #root::before (flex-item), не padding;
 * body.padding-top не использует safe-area-inset-top; у #root в index.html нет
 * inline min-height / -webkit-fill-available.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = path.resolve(DIR, '../src/index.css');
const INDEX_HTML = path.resolve(DIR, '../index.html');

function extractRule(css: string, selector: string): string | null {
  const re = new RegExp(
    `(?:^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const match = css.match(re);
  return match ? match[1] : null;
}

describe('index.css: safe-area на оболочке без сдвига fixed-таббара', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');

  it('body не задаёт padding-top через safe-area-inset-top', () => {
    const bodyBlocks = [...css.matchAll(/(?:^|\n)body\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(bodyBlocks.length).toBeGreaterThan(0);
    for (const block of bodyBlocks) {
      expect(block).not.toMatch(/padding-top\s*:\s*[^;]*safe-area-inset-top/);
    }
  });

  it('#root не задаёт padding-top через safe-area-inset-top', () => {
    const root = extractRule(css, '#root');
    expect(root).toBeTruthy();
    expect(root!).not.toMatch(/padding-top\s*:\s*[^;]*safe-area-inset-top/);
  });

  it('#root::before резервирует верхний safe-area как flex-item', () => {
    const before = extractRule(css, '#root::before');
    expect(before).toBeTruthy();
    expect(before!).toMatch(/flex\s*:\s*0\s+0\s+env\(\s*safe-area-inset-top/);
  });
});

describe('index.html: #root без inline min-height (iOS fill-available)', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  const rootOpenTag = html.match(/<div\s+id=["']root["']([^>]*)>/i)?.[0] ?? '';

  it('находит открывающий тег #root', () => {
    expect(rootOpenTag).toMatch(/id=["']root["']/i);
  });

  it('не содержит inline style с min-height', () => {
    expect(rootOpenTag).not.toMatch(/\bstyle\s*=/i);
    expect(rootOpenTag).not.toMatch(/min-height/i);
  });

  it('не содержит -webkit-fill-available на #root', () => {
    expect(rootOpenTag).not.toMatch(/-webkit-fill-available/i);
  });
});
