import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессия «кремовой полосы» под таббаром в iOS PWA.
 *
 * На скрине iPhone 14 (1170×2532 @3x) пустая полоса снизу была ровно 141 px =
 * 47 pt = safe-area-inset-top. Причина: `body { height: 100dvh; padding-top: env(safe-area-inset-top) }`
 * при border-box сжимал контент, а #root с той же height:100dvh вылезал на величину
 * верхнего inset — снизу оставалась дыра цвета --surface, и fixed-таббар
 * визуально «парил» над ней.
 *
 * Инвариант: верхний inset живёт на #root, body держит padding-top: 0.
 */
const INDEX_CSS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/index.css',
);

function extractRule(css: string, selector: string): string | null {
  // Только «голое» правило: начало строки / после } или перевода строки, без префикса.
  const re = new RegExp(
    `(?:^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const match = css.match(re);
  return match ? match[1] : null;
}

describe('index.css: safe-area padding на оболочке', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');

  it('body не задаёт padding-top через safe-area-inset-top', () => {
    // Все объявления body { ... } — ни одно не должно ставить inset наверх.
    const bodyBlocks = [...css.matchAll(/(?:^|\n)body\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(bodyBlocks.length).toBeGreaterThan(0);
    for (const block of bodyBlocks) {
      expect(block).not.toMatch(/padding-top\s*:\s*[^;]*safe-area-inset-top/);
    }
  });

  it('#root задаёт padding-top через safe-area-inset-top', () => {
    const root = extractRule(css, '#root');
    expect(root).toBeTruthy();
    expect(root!).toMatch(/padding-top\s*:\s*env\(\s*safe-area-inset-top/);
  });
});
