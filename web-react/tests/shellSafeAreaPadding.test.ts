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
const VIEWPORT_HEIGHT = path.resolve(DIR, '../src/lib/viewportHeight.ts');
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

describe('index.html: viewport без interactive-widget на iOS', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');

  it('статический meta viewport не включает interactive-widget', () => {
    const viewport = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i);
    expect(viewport?.[1]).toBeTruthy();
    expect(viewport![1]).not.toMatch(/interactive-widget/);
  });

  it('interactive-widget добавляется только по UA Android', () => {
    expect(html).toMatch(/Android[\s\S]{0,400}interactive-widget=resizes-content/);
  });

  it('до React ставит app-ios-lvh-shell на iOS 3+', () => {
    expect(html).toMatch(/app-ios-lvh-shell/);
    expect(html).toMatch(/major > 3 \|\| \(major === 3 && minor >= 0\)/);
  });
});

describe('index.css: page-enter не залипает на iOS', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');

  it('page-enter имеет opacity 1 и отключает анимацию на WebKit touch', () => {
    const block = extractRule(css, '.page-enter');
    expect(block).toMatch(/opacity\s*:\s*1/);
    expect(css).toMatch(
      /@supports\s*\(\s*-webkit-touch-callout\s*:\s*none\s*\)[\s\S]*?\.page-enter[\s\S]*?animation\s*:\s*none/,
    );
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
  const heightSrc = readFileSync(VIEWPORT_HEIGHT, 'utf8');

  it('не выбирает высоту через Math.min из-за одного data-chat-open', () => {
    expect(src).not.toMatch(/if\s*\(\s*narrowMobileChat\s*\|\|\s*keyboardOpen\s*\)/);
  });

  it('высоту считает через chooseViewportHeightPx, а не локальный Math.min', () => {
    expect(src).toMatch(/chooseViewportHeightPx/);
    expect(src).not.toMatch(/if\s*\(\s*keyboardOpen\s*\)\s*\{[\s\S]*?Math\.min/);
  });

  it('Math.min-ветка в viewportHeight завязана только на keyboardOpen', () => {
    expect(heightSrc).toMatch(/if\s*\(\s*input\.keyboardOpen\s*\)\s*\{[\s\S]*?Math\.min/);
  });
});

describe('nativeShellViewport: iOS idle не сажает оболочку в пиксели', () => {
  const src = readFileSync(NATIVE_SHELL_VIEWPORT, 'utf8');

  it('на iOS 3+ без клавиатуры пишет 100lvh/100vh, а не px-клетку', () => {
    expect(src).toMatch(/iosIdleViewportCss/);
    expect(src).toMatch(/iosNeedsLvhIdleShell/);
    expect(src).toMatch(/shouldUseCssViewportOnIosIdle/);
    expect(src).toMatch(/layoutBottomInsetPx/);
    expect(src).toMatch(/pinBottomNavToLayoutInset/);
    expect(src).toMatch(/app-ios-lvh-shell/);
  });
});

describe('index.css: iOS idle оболочка на 100lvh', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');

  it('WebKit idle использует 100vh затем 100lvh', () => {
    expect(css).toMatch(
      /@supports\s*\(\s*-webkit-touch-callout\s*:\s*none\s*\)[\s\S]*?html\.app-native-shell\.app-ios-lvh-shell:not\(\.app-keyboard-open\)[\s\S]*?height:\s*100vh[\s\S]*?height:\s*100lvh/,
    );
  });

  it('таббар на мобилке сидит на --app-keyboard-inset, а не только bottom:0', () => {
    expect(css).toMatch(/nav\.app-bottom-nav\.bottom-nav[\s\S]*?bottom:\s*var\(--app-keyboard-inset/);
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
