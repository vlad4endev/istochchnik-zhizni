import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессия: PWA «не открывается» на iOS старше 18.
 *
 * Корни:
 * 1) Autoprefixer без browserslist целился только в ios_saf 18.5+;
 * 2) Vite без явного build.target в будущем может подняться до Safari 16.4+;
 * 3) LiveKit (Object.hasOwn, тяжёлый бандл) в entry через Layout;
 * 4) inline bootstrap с optional catch / отсутствие 100vh-фолбэка для dvh.
 */
const DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(DIR, '../package.json');
const VITE = path.resolve(DIR, '../vite.config.ts');
const MAIN = path.resolve(DIR, '../src/main.tsx');
const LAYOUT = path.resolve(DIR, '../src/app/Layout.tsx');
const POLYFILLS = path.resolve(DIR, '../src/lib/legacyBrowserPolyfills.ts');
const CALL_HOST = path.resolve(DIR, '../src/features/calls/CallWindowHost.tsx');
const INDEX_CSS = path.resolve(DIR, '../src/index.css');
const SPLASH_CSS = path.resolve(DIR, '../public/app-splash.css');

describe('iOS legacy floor: browserslist + Vite target', () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as { browserslist?: string[] };
  const vite = readFileSync(VITE, 'utf8');

  it('browserslist держит iOS/Safari >= 15.4', () => {
    expect(pkg.browserslist).toEqual(
      expect.arrayContaining(['iOS >= 15.4', 'Safari >= 15.4', 'Chrome >= 90']),
    );
  });

  it('vite build.target явно включает safari15.4 / ios15.4', () => {
    expect(vite).toMatch(/target:\s*\[[^\]]*safari15\.4/);
    expect(vite).toMatch(/ios15\.4/);
    expect(vite).toMatch(/cssTarget:\s*\[[^\]]*safari15\.4/);
  });

  it('livekit вынесен в manualChunks vendor-livekit', () => {
    expect(vite).toMatch(/['"]vendor-livekit['"]\s*:\s*\[[^\]]*livekit-client/);
  });
});

describe('iOS legacy floor: boot polyfills + lazy CallWindow', () => {
  const main = readFileSync(MAIN, 'utf8');
  const layout = readFileSync(LAYOUT, 'utf8');
  const polyfills = readFileSync(POLYFILLS, 'utf8');
  const host = readFileSync(CALL_HOST, 'utf8');

  it('main.tsx импортирует полифиллы до остальных модулей', () => {
    const polyIdx = main.indexOf("import './lib/legacyBrowserPolyfills'");
    const nextImport = main.indexOf("import { QueryClient");
    expect(polyIdx).toBeGreaterThanOrEqual(0);
    expect(nextImport).toBeGreaterThan(polyIdx);
  });

  it('полифилл ставит Object.hasOwn', () => {
    expect(polyfills).toMatch(/Object\.hasOwn/);
    expect(polyfills).toMatch(/installLegacyBrowserPolyfills/);
  });

  it('Layout не импортирует CallWindow синхронно (только Host)', () => {
    expect(layout).not.toMatch(/from ['"]\.\.\/features\/calls\/CallWindow['"]/);
    expect(layout).toMatch(/CallWindowHost/);
    expect(host).toMatch(/lazy\(/);
    expect(host).toMatch(/import\(['"]\.\/CallWindow['"]\)/);
  });
});

describe('iOS legacy floor: CSS viewport fallbacks', () => {
  const css = readFileSync(INDEX_CSS, 'utf8');
  const splash = readFileSync(SPLASH_CSS, 'utf8');

  it('--viewport-height объявляет 100vh до 100dvh', () => {
    expect(css).toMatch(
      /--viewport-height:\s*100vh;\s*--viewport-height:\s*100dvh;/,
    );
  });

  it('splash min-height: 100vh до 100dvh', () => {
    expect(splash).toMatch(/min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  });
});
