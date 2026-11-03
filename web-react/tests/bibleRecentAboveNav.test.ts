import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * На странице «Библия» раздел «Недавние» уходил под плавающую нижнюю панель:
 * контент имел фиксированный pb-8 (2rem), которого не хватало, чтобы очистить таб-бар.
 * Нижний отступ должен учитывать --app-bottom-nav-total-height, иначе последний блок
 * остаётся за панелью даже при прокрутке в самый низ.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(dir, '../src/features/bible/pages/BibleHomePage.tsx'), 'utf8');

describe('bible home page — recent above bottom nav', () => {
  it('контент страницы имеет нижний отступ с учётом высоты таб-бара на мобиле', () => {
    const contentDiv = src.match(/className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 [^"]*"/)?.[0] ?? '';
    expect(contentDiv).toMatch(/pb-8/);
    expect(contentDiv).toMatch(/max-lg:pb-\[calc\(var\(--app-bottom-nav-total-height,0px\)\+var\(--app-bottom-nav-content-gap,1rem\)\)\]/);
  });
});
