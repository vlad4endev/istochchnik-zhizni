import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Шторка «Как показать текст» рендерится через BodyPortal в document.body.
 * Токены --sd-* заданы inline только на обёртке страницы и туда не наследуются.
 * Без них bg-[var(--sd-surface)] невалиден, фон прозрачный, и текст песни просвечивает сквозь настройки.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.resolve(dir, '../src/features/songbook/pages/SongDetailPage.tsx'), 'utf8');

describe('song detail settings sheet', () => {
  it('портал настроек несёт semanticVars, чтобы фон и переключатели были непрозрачными', () => {
    const openTag = src.match(/<div\b[^>]*aria-label="Настройки текста песни"/)?.[0] ?? '';
    expect(openTag).toMatch(/style=\{semanticVars(?: as CSSProperties)?\}/);
    expect(openTag).toMatch(/bg-\[var\(--sd-surface\)\]/);
    expect(src).toMatch(/<BodyPortal>/);
  });
});
