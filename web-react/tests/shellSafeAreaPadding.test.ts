import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессия «кремовой полосы» под таббаром в iOS Safari/PWA.
 *
 * На скрине iPhone (1170×2532 @3x) пустая полоса снизу была ровно 141 px =
 * 47 pt = safe-area-inset-top. Две связанные причины:
 *
 * 1. `body`/`#root { height:100dvh; padding-top: env(safe-area-inset-top) }` при
 *    overflow:hidden укорачивал containing block для `position:fixed` — таббар с
 *    bottom:0 садился выше низа экрана на величину top-inset.
 * 2. `Math.min(visualViewport, innerHeight)` в nativeShellViewport иногда записывал
 *    в --viewport-height значение короче экрана ровно на top-inset.
 *
 * Инварианты: верхний inset — через #root::before (flex-item), не padding;
 * body.padding-top не использует safe-area-inset-top.
 */
const INDEX_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/index.css',
);

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
