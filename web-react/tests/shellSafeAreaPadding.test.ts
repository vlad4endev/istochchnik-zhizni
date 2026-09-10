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
 * 4. При `data-chat-open` sync всё ещё брал Math.min — open/close fullscreen фото
 *    в чате дёргал visualViewport, и укороченная высота залипала после закрытия.
 * 5. `#root::before` (flex-item top-inset) + `#root { overflow:hidden }` на iOS всё
 *    ещё укорачивает fixed-CB: таббар оставался DOM-потомком #root (и flex-sibling
 *    после ::before через Layout `overflow-x-hidden`). Геометрия iPhone 13 Pro:
 *    shell H=844pt, ::before=47pt → CB usable ≈797pt → bottom:0 на 47pt выше низа.
 *
 * Инварианты: верхний inset — через #root::before (flex-item), не padding;
 * body.padding-top не использует safe-area-inset-top; у #root в index.html нет
 * inline min-height / -webkit-fill-available; Math.min только при клавиатуре;
 * таббар порталится в document.body (вне #root overflow CB).
 */
const DIR = path.dirname(fileURLToPath(import.meta.url));
const INDEX_CSS = path.resolve(DIR, '../src/index.css');
const INDEX_HTML = path.resolve(DIR, '../index.html');
const NATIVE_SHELL_VIEWPORT = path.resolve(DIR, '../src/lib/nativeShellViewport.ts');
const LAYOUT_TSX = path.resolve(DIR, '../src/app/Layout.tsx');

function extractRule(css: string, selector: string): string | null {
  const re = new RegExp(
    `(?:^|[}\\n])\\s*${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
    'm',
  );
  const match = css.match(re);
  return match ? match[1] : null;
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('index.css: safe-area на оболочке без сдвига fixed-таббара', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');

  it('body не задаёт padding-top через safe-area-inset-top', () => {
    const bodyBlocks = [...css.matchAll(/(?:^|\n)body\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(bodyBlocks.length).toBeGreaterThan(0);
    for (const block of bodyBlocks) {
      expect(stripCssComments(block)).not.toMatch(/padding-top\s*:\s*[^;]*safe-area-inset-top/);
    }
  });

  it('#root не задаёт padding-top через safe-area-inset-top', () => {
    const root = extractRule(css, '#root');
    expect(root).toBeTruthy();
    expect(stripCssComments(root!)).not.toMatch(/padding-top\s*:\s*[^;]*safe-area-inset-top/);
    expect(stripCssComments(root!)).toMatch(/padding-top\s*:\s*0\s*;/);
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

describe('nativeShellViewport: Math.min только при клавиатуре (фото в чате)', () => {
  const src = readFileSync(NATIVE_SHELL_VIEWPORT, 'utf8');

  it('не выбирает высоту через Math.min из-за одного data-chat-open', () => {
    expect(src).not.toMatch(/if\s*\(\s*narrowMobileChat\s*\|\|\s*keyboardOpen\s*\)/);
  });

  it('Math.min-ветка завязана только на keyboardOpen', () => {
    expect(src).toMatch(/if\s*\(\s*keyboardOpen\s*\)\s*\{[\s\S]*?Math\.min/);
  });
});

describe('Layout.tsx: таббар вне #root overflow containing block', () => {
  const src = readFileSync(LAYOUT_TSX, 'utf8');

  it('порталит app-bottom-nav в document.body', () => {
    expect(src).toMatch(/createPortal\s*\(/);
    expect(src).toMatch(/document\.body/);
    expect(src).toMatch(/app-bottom-nav/);
    // Портал должен охватывать nav, а не только дочерние оверлеи.
    expect(src).toMatch(/createPortal\s*\(\s*\n?\s*<nav[\s\S]*?app-bottom-nav[\s\S]*?document\.body/);
  });
});
