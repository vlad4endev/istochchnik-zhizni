import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Страница планов чтения Библии:
 * - форма создания отправляет start_date (иначе план не календарный),
 * - поля ввода имеют явный цвет текста (PWA/WebView не наследует color в dark-теме),
 * - строка дня показывает дату и число глав, шапка — диапазон плана.
 */
const dir = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(
  path.resolve(dir, '../src/features/bible/pages/BiblePlanPage.tsx'),
  'utf8',
);

describe('bible plan page', () => {
  it('генерация передаёт дату старта', () => {
    expect(src).toMatch(/generateBiblePlan\(\{[^}]*start_date:\s*startDate \|\| undefined/s);
    expect(src).toMatch(/type="date"/);
  });

  it('поля ввода дней и даты имеют явный цвет текста', () => {
    const tagFor = (type: string): string => {
      const i = src.indexOf(`type="${type}"`);
      if (i < 0) return '';
      const start = src.lastIndexOf('<input', i);
      const end = src.indexOf('/>', i);
      return src.slice(start, end);
    };
    expect(tagFor('number')).toMatch(/text-stone-900/);
    expect(tagFor('date')).toMatch(/text-stone-900/);
  });

  it('строка дня показывает дату и число глав', () => {
    expect(src).toMatch(/formatPlanDate\(day\.day_date\)/);
    expect(src).toMatch(/chaptersLabel\(dayChapterCount\(day\)\)/);
  });

  it('шапка плана показывает диапазон дат', () => {
    expect(src).toMatch(/formatPlanDate\(plan\.start_date\)/);
    expect(src).toMatch(/formatPlanDate\(plan\.end_date\)/);
  });
});
