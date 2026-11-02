import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Шторка заметки/церковного комментария рендерится на тёмном фоне `--surface-elevated`,
 * а текстовые поля используют `bg-white`, который в тёмной теме глобально переопределяется
 * в `var(--bg-card)` (index.css: `html.dark .bg-white { background-color: var(--bg-card) !important; }`).
 *
 * В мобильных WebView (PWA) `<textarea>` не наследует `color` от родителя и без явного
 * токена рисует системным чёрным — чёрный текст на тёмном фоне = невидимо.
 * `text-stone-900` — тема-адаптивный (tailwind.palette.js: `--fg-stone-900`), в тёмной
 * теме становится светлым, поэтому набираемый текст виден в обеих темах.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.resolve(dir, '../src/features/bible/pages/BibleReaderPage.tsx'),
  'utf8',
);

function textareaClassFor(placeholder: string): string {
  const re = new RegExp(
    `placeholder="${placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*\\n\\s*className="([^"]*)"`,
  'm',
  );
  return re.exec(src)?.[1] ?? '';
}

describe('bible reader note textareas', () => {
  it('личная заметка имеет тема-адаптивный цвет текста и плейсхолдера', () => {
    const cls = textareaClassFor('Личная заметка…');
    expect(cls).toMatch(/text-stone-900/);
    expect(cls).toMatch(/placeholder:text-stone-400/);
    expect(cls).toMatch(/bg-white/);
  });

  it('церковный комментарий имеет тема-адаптивный цвет текста и плейсхолдера', () => {
    const cls = textareaClassFor('Церковный комментарий…');
    expect(cls).toMatch(/text-stone-900/);
    expect(cls).toMatch(/placeholder:text-stone-400/);
    expect(cls).toMatch(/bg-white/);
  });
});
