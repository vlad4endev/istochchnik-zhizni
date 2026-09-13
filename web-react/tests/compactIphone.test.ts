import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(path.resolve(DIR, '../src/styles/compactIphone.css'), 'utf8');
const MAIN = readFileSync(path.resolve(DIR, '../src/main.tsx'), 'utf8');
const HEADER = readFileSync(path.resolve(DIR, '../src/components/layout/PageHeader.tsx'), 'utf8');

describe('compactIphone.css: iPhone 5–11', () => {
  it('подключается из main.tsx после mobile.css', () => {
    expect(MAIN).toMatch(/import '\.\/styles\/mobile\.css'/);
    expect(MAIN).toMatch(/import '\.\/styles\/compactIphone\.css'/);
    expect(MAIN.indexOf("compactIphone.css")).toBeGreaterThan(MAIN.indexOf("mobile.css"));
  });

  it('покрывает 320 / 375 / 414 и короткую высоту 568–667', () => {
    expect(CSS).toMatch(/max-width:\s*430px/);
    expect(CSS).toMatch(/max-width:\s*359px/);
    expect(CSS).toMatch(/max-height:\s*740px/);
    expect(CSS).toMatch(/320/);
    expect(CSS).toMatch(/414/);
  });

  it('не ломает мессенджер глобальными полями дашборда', () => {
    expect(CSS).toMatch(/data-messenger-open/);
  });

  it('PageHeader носит хук app-page-header', () => {
    expect(HEADER).toMatch(/app-page-header/);
  });
});
