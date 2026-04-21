/**
 * Делит строку на визуальные графемы (учёт суррогатных пар, составных эмодзи и т.д.).
 * Используется для якорения аккорда над первым символом без влияния ширины длинного аккорда на весь фрагмент.
 */
export function splitGraphemeClusters(input: string, locale = 'ru'): string[] {
  const source = typeof input === 'string' ? input : '';
  if (source.length === 0) return [];

  try {
    const IntlAny = Intl as typeof Intl & {
      Segmenter?: new (loc: string, opts: { granularity: 'grapheme' }) => {
        segment: (s: string) => Iterable<{ segment: string }>;
      };
    };
    const Segmenter = IntlAny.Segmenter;
    if (typeof Segmenter === 'function') {
      const iter = new Segmenter(locale, { granularity: 'grapheme' }).segment(source);
      return Array.from(iter, (s) => s.segment);
    }
  } catch {
    // ignore, fallback below
  }

  return Array.from(source);
}
