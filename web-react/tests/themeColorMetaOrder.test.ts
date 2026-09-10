import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * HTML-стандарт, «To obtain a page's theme color»: chrome берёт ПЕРВЫЙ по порядку
 * в дереве `meta[name=theme-color]`, у которого есть `content` и совпадает `media`.
 *
 * Отсюда два требования к index.html, которые легко сломать простой перестановкой
 * строк и которые ничем себя не проявят до релиза:
 *
 * 1. Слот `data-app-managed` (в него пишет applyDocumentAccessibility.ts) обязан
 *    идти ПЕРВЫМ — иначе выбранная в приложении тема не доходит до статус-бара,
 *    потому что системная пара light/dark совпадает всегда.
 * 2. В нём не должно быть `content` — пустой слот не кандидат, поэтому до старта
 *    React работает системная пара, а не пустая строка вместо цвета.
 */
const INDEX_HTML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../index.html',
);

interface MetaTag {
  raw: string;
  attrs: Record<string, string | true>;
}

function themeColorMetas(html: string): MetaTag[] {
  const out: MetaTag[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/g)) {
    const raw = match[0];
    const attrs: Record<string, string | true> = {};
    for (const attr of raw.matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) {
      if (attr[1] === 'meta') continue;
      attrs[attr[1]] = attr[2] ?? true;
    }
    if (attrs.name === 'theme-color') out.push({ raw, attrs });
  }
  return out;
}

describe('index.html: порядок meta[name=theme-color]', () => {
  const metas = themeColorMetas(readFileSync(INDEX_HTML, 'utf8'));

  it('содержит слот темы приложения и системную пару light/dark', () => {
    expect(metas.length).toBe(3);
  });

  it('слот data-app-managed объявлен первым', () => {
    expect(metas[0]?.attrs['data-app-managed']).toBeDefined();
  });

  it('слот объявлен без content, чтобы до старта React он не был кандидатом', () => {
    expect(metas[0]?.attrs.content).toBeUndefined();
  });

  it('системная пара идёт после слота и задаёт и media, и content', () => {
    for (const meta of metas.slice(1)) {
      expect(meta.attrs['data-app-managed']).toBeUndefined();
      expect(typeof meta.attrs.media).toBe('string');
      expect(typeof meta.attrs.content).toBe('string');
    }
    expect(metas.slice(1).map((m) => m.attrs.media)).toEqual([
      '(prefers-color-scheme: light)',
      '(prefers-color-scheme: dark)',
    ]);
  });

  it('media-запросы уникальны, как требует стандарт', () => {
    const medias = metas.map((m) => m.attrs.media ?? '(none)');
    expect(new Set(medias).size).toBe(medias.length);
  });
});
