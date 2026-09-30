import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессии мобильной верстки (PWA iOS/Android), найденные аудитом:
 * - нижний таб-бар шире экрана на боковой padding (обрезалась вкладка «Ещё»);
 * - перенос длинных слов был включён только в тёмной теме;
 * - общий `padding: 10px 12px !important` затирал pl-9 под иконку поиска;
 * - `main:not(.tg-main)` обнулял padding у main.studio-main — контент прижимался к краям;
 * - потомок высотой во весь --viewport-height вылезал за низ #root на величину выреза.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.resolve(dir, '..', rel), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('mobile layout invariants', () => {
  const indexCss = strip(read('src/index.css'));
  const mobileCss = strip(read('src/styles/mobile.css'));

  it('ряд таб-бара не использует width:100% вместе с content-box padding', () => {
    const block = indexCss.match(/nav\.app-bottom-nav \.app-bottom-nav__row\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toMatch(/box-sizing:\s*content-box/);
    expect(block).not.toMatch(/(?<![-\w])width:\s*100%/);
  });

  it('overflow-wrap:anywhere действует во всех темах, а не только html.dark', () => {
    expect(indexCss).toMatch(/@media \(max-width: 767px\)\s*\{\s*#root,\s*main\.app-main-content\s*\{\s*overflow-wrap:\s*anywhere/);
    expect(indexCss).not.toMatch(/html\.dark #root,\s*html\.dark main\.app-main-content/);
  });

  it('отступы полей в mobile.css не !important — утилиты pl-*/pr-* работают', () => {
    expect(mobileCss).not.toMatch(/padding:\s*10px 12px\s*!important/);
  });

  it('обнуление padding у main не трогает main.studio-main', () => {
    expect(mobileCss).toMatch(/main:not\(\.tg-main\):not\(\.studio-main\)/);
  });

  it('есть --app-content-height (вьюпорт минус верхний inset) и StudioLayout не берёт полный --viewport-height', () => {
    expect(indexCss).toMatch(/--app-content-height:\s*calc\(var\(--viewport-height[^)]*\)\s*-\s*env\(safe-area-inset-top/);
    expect(strip(read('src/features/studio/StudioLayout.tsx'))).not.toMatch(/height:\s*'var\(--viewport-height/);
  });

  it('blanket [class*=grid-cols-2] не сводит sm:/md: варианты в одну колонку до 1023px', () => {
    expect(indexCss).not.toMatch(/\[class\*='grid-cols-2'\]/);
  });

  it('текст сообщений мессенджера переносится через overflow-wrap:anywhere, а не break-word', () => {
    const css = strip(read('src/features/messenger/components/messenger.css'));
    const block = css.match(/\.msg-content,\s*\.tg-messenger \.message-bubble \.mention-rich-text\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toMatch(/overflow-wrap:\s*anywhere/);
    expect(block).not.toMatch(/overflow-wrap:\s*break-word/);
  });

  it('переключатели role=switch исключены из принудительных 44px (иначе h-6 w-11 превращается в круг)', () => {
    expect(mobileCss).toMatch(/button\[class\*='h-'\]:not\(\.tap-compact\):not\(\[role='switch'\]\)/);
  });

  it('подписи статистики публичного профиля не рвутся посреди слова', () => {
    const css = strip(read('src/features/profile/pages/PublicProfilePage.module.css'));
    const block = css.match(/\.igStatCellLabel\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toMatch(/overflow-wrap:\s*normal/);
    expect(block).toMatch(/white-space:\s*nowrap/);
  });

  it('при открытой клавиатуре запас под плавающую «+» на дашборде снимается (нет пустой полосы)', () => {
    expect(indexCss).toMatch(/html\.app-keyboard-open \.dashboard-scroll-pane\s*\{[^}]*padding-bottom:\s*0\.75rem\s*!important/);
  });

  it('в установленной PWA шапка чата всегда получает отступ под статус-бар (даже при сдвиге visual viewport)', () => {
    const css = strip(read('src/features/messenger/components/messenger.css'));
    expect(css).toMatch(
      /html\[data-pwa-standalone='1'\]\[data-chat-open="1"\] \.tg-main--visible \.tg-chat-window\s*\{\s*padding-top:\s*env\(safe-area-inset-top,\s*0px\);/,
    );
  });
});
