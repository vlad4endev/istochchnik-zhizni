import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Регрессионный аудит тёмной темы PWA по всем полям ввода проекта.
 *
 * Баг-класс, который уже несколько раз «выстреливал» (заметка/комментарий в читалке
 * Библии, поле ввода ИИ-чата и др.): поле со светлым фоном (`bg-white`, `bg-stone-50`…)
 * и БЕЗ явного токена цвета текста. В тёмной теме `bg-white` глобально переопределяется
 * в тёмный `var(--bg-card)`, а мобильный WebView не наследует `color` в form-контролы —
 * набираемый текст рисуется системным чёрным на тёмном фоне = невидимо.
 *
 * Лечится либо тема-адаптивным токеном текста (`text-stone-900` и т.п., в тёмной теме
 * становится светлым через tailwind.palette.js), либо глобальным правилом
 * `html.dark input/textarea/select { color: var(--text) }`. Тест ниже требует явного
 * токена у статически заданных полей — чтобы новое поле не зависело только от глобального
 * правила (оно может проиграть более специфичному `text-*` или inline-стилю).
 *
 * Аудируем только ПОЛНОСТЬЮ статические className ("…", {'…'}, `…` без ${}): классы,
 * собранные через хелперы/переменные (`fieldClass()`, `${theme.input}`, {INPUT}),
 * централизованы и тема-адаптивны — их статически не resolve'им и пропускаем осознанно.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const SRC = path.join(root, 'src');

const LIGHT_BG =
  /\bbg-(white|stone-50|stone-100|gray-50|gray-100|zinc-50|zinc-100|neutral-50|neutral-100|slate-50|slate-100)\b/;
const TEXT_COLOR =
  /\btext-(?:[a-z]+-\d{2,3}|white|black|inherit|current)\b|\btext-\[|\bdark:text-|color:\s*var\(/;

function* walk(d: string): Generator<string> {
  for (const name of readdirSync(d)) {
    const full = path.join(d, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx|jsx)$/.test(name)) yield full;
  }
}

/**
 * Возвращает статический className тега, или null, если он динамический
 * (выражение с ${…}, вызов функции, идентификатор) — такие пропускаем.
 */
function staticClassName(tag: string): string | null {
  const m = /className\s*=\s*("([^"]*)"|'([^']*)'|\{\s*'([^']*)'\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*`([^`]*)`\s*\})/.exec(
    tag,
  );
  if (!m) return null;
  const literal = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '';
  // Страховка: любой признак динамики внутри литерала — пропускаем.
  if (literal.includes('${')) return null;
  return literal;
}

describe('pwa: тёмная тема полей ввода', () => {
  const offenders: string[] = [];
  let staticChecked = 0;

  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    const rel = path.relative(root, file).split(path.sep).join('/');
    const tagRe = /<(input|textarea|select)\b[\s\S]*?(?:\/>|>)/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(src))) {
      const tag = m[0];
      if (/type=["'](checkbox|radio|file|hidden|range|color)["']/.test(tag)) continue;
      const cls = staticClassName(tag);
      if (cls === null || !cls.trim()) continue;
      if (!LIGHT_BG.test(cls)) continue;
      staticChecked++;
      if (!TEXT_COLOR.test(cls)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel}:${line} <${m[1]}> ${cls.trim().replace(/\s+/g, ' ').slice(0, 120)}`);
      }
    }
  }

  it('ни одно статически заданное поле со светлым фоном не остаётся без явного цвета текста', () => {
    expect(offenders.join('\n')).toBe('');
    // sanity: аудит действительно что-то проверил (иначе регэксп молча сломался).
    expect(staticChecked).toBeGreaterThan(0);
  });

  it('глобальное правило тёмной темы покрывает input, textarea и select', () => {
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/html\.dark input,[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/html\.dark textarea/);
    expect(rule).toMatch(/html\.dark select/);
    expect(rule).toMatch(/color:\s*var\(--text\)/);
  });

  it('для тёмных тем выставлен color-scheme: dark (нативные контролы/скроллбары в WebView)', () => {
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8');
    const darkBlock = css.match(/html\.dark,[\s\S]*?\{[^}]*\}/)?.[0] ?? '';
    expect(darkBlock).toMatch(/color-scheme:\s*dark/);
  });

  it('viewport-fit=cover в index.html (учёт вырезов и home-indicator в PWA)', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });
});
