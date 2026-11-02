import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import {
  buildPlanDayLabel,
  evenChunkSizes,
  rebalancePlanDays,
  validateAiPlanPayload,
  type BiblePlanDayInput,
  type BiblePlanRef,
} from './biblePlansService';

describe('validateAiPlanPayload', () => {
  it('accepts valid plan JSON', () => {
    const validated = validateAiPlanPayload({
      title: 'Евангелия',
      days: [
        {
          day: 1,
          label: 'Иоанн 1',
          refs: [{ book_slug: 'john', chapter: 1 }],
        },
        {
          day: 2,
          refs: [{ book: 'matthew', chapter: 5, verse_start: 1, verse_end: 12 }],
        },
      ],
    });
    assert.ok(validated);
    assert.equal(validated!.title, 'Евангелия');
    assert.equal(validated!.days.length, 2);
    assert.equal(validated!.days[1]!.refs[0]!.book_slug, 'matthew');
  });

  it('rejects invalid book or chapter', () => {
    const validated = validateAiPlanPayload({
      title: 'Bad',
      days: [{ day: 1, refs: [{ book_slug: 'not-a-book', chapter: 1 }] }],
    });
    assert.equal(validated, null);
  });
});

describe('evenChunkSizes', () => {
  it('распределяет остаток по первым дням, не в последний', () => {
    assert.deepEqual(evenChunkSizes(89, 25), [
      ...Array.from({ length: 14 }, () => 4),
      ...Array.from({ length: 11 }, () => 3),
    ]);
  });

  it('делит без остатка ровно', () => {
    assert.deepEqual(evenChunkSizes(21, 7), [3, 3, 3, 3, 3, 3, 3]);
  });

  it('ограничивает размер, когда отрывков меньше дней, решает вызывающий код', () => {
    assert.deepEqual(evenChunkSizes(3, 3), [1, 1, 1]);
    assert.deepEqual(evenChunkSizes(2, 3), [1, 1, 0]);
  });
});

/** 89 глав Евангелий подряд, как выдаёт модель: дни по 3, остаток в последний день. */
function gospelsDumpedIntoLastDay(days: number): BiblePlanDayInput[] {
  const gospelSlugs = ['matthew', 'mark', 'luke', 'john'];
  const refs: BiblePlanRef[] = gospelSlugs.flatMap((slug) => {
    const def = BIBLE_BOOK_DEFS.find((b) => b.slug === slug)!;
    return Array.from({ length: def.chapters }, (_, i) => ({
      book_slug: slug,
      chapter: i + 1,
    }));
  });
  assert.equal(refs.length, 89);
  const out: BiblePlanDayInput[] = [];
  let offset = 0;
  for (let i = 0; i < days - 1; i += 1) {
    out.push({ day: i + 1, label: `День ${i + 1}`, refs: refs.slice(offset, offset + 3) });
    offset += 3;
  }
  out.push({ day: days, label: `День ${days}`, refs: refs.slice(offset) });
  return out;
}

describe('rebalancePlanDays', () => {
  it('«Евангелия за 25 дней»: убирает свалку глав в последний день', () => {
    const broken = gospelsDumpedIntoLastDay(25);
    assert.equal(broken[24]!.refs.length, 17); // как у пользователя: в последний день свален остаток

    const fixed = rebalancePlanDays(broken, 25);
    assert.equal(fixed.length, 25);

    // Все 89 глав на месте, порядок сохранён.
    const flat = fixed.flatMap((d) => d.refs.map((r) => `${r.book_slug}:${r.chapter}`));
    assert.equal(flat.length, 89);
    assert.equal(flat[0], 'matthew:1');
    assert.equal(flat[27], 'matthew:28');
    assert.equal(flat[28], 'mark:1');
    assert.equal(flat[88], 'john:21');

    // Размеры дней отличаются не более чем на 1 главу; остаток — в первые дни.
    const sizes = fixed.map((d) => d.refs.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.deepEqual(sizes, [
      ...Array.from({ length: 14 }, () => 4),
      ...Array.from({ length: 11 }, () => 3),
    ]);
    assert.equal(fixed[24]!.refs.length, 3);

    // Дни пронумерованы подряд, подписи соответствуют фактическому диапазону.
    fixed.forEach((d, i) => assert.equal(d.day, i + 1));
    assert.equal(fixed[0]!.label, 'Мф 1–4');
    assert.equal(fixed[6]!.label, 'Мф 25–28');
    assert.equal(fixed[7]!.label, 'Мк 1–4');
    assert.equal(fixed[24]!.label, 'Ин 19–21');
  });

  it('ровный план не трогает: подписи модели сохраняются', () => {
    const even: BiblePlanDayInput[] = [
      { day: 1, label: 'Начало', refs: [{ book_slug: 'john', chapter: 1 }] },
      { day: 2, label: 'Продолжение', refs: [{ book_slug: 'john', chapter: 2 }] },
    ];
    const out = rebalancePlanDays(even, 2);
    assert.equal(out[0]!.label, 'Начало');
    assert.equal(out[1]!.label, 'Продолжение');
    assert.deepEqual(out.map((d) => d.day), [1, 2]);
  });

  it('приводит число дней к запрошенному, если модель вернула больше', () => {
    const tooMany: BiblePlanDayInput[] = Array.from({ length: 30 }, (_, i) => ({
      day: i + 1,
      refs: [{ book_slug: 'psalms', chapter: i + 1 }],
    }));
    const out = rebalancePlanDays(tooMany, 25);
    assert.equal(out.length, 25);
    const sizes = out.map((d) => d.refs.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.equal(out.flatMap((d) => d.refs).length, 30);
  });

  it('не создаёт пустые дни, когда отрывков меньше запрошенных дней', () => {
    const few: BiblePlanDayInput[] = [
      { day: 1, refs: [{ book_slug: 'philemon', chapter: 1, verse_start: 1, verse_end: 13 }] },
      { day: 2, refs: [{ book_slug: 'philemon', chapter: 1, verse_start: 14, verse_end: 25 }] },
    ];
    const out = rebalancePlanDays(few, 7);
    assert.equal(out.length, 2);
    assert.ok(out.every((d) => d.refs.length > 0));
  });

  it('тематический (не канонический) план не перебивает, только перенумеровывает', () => {
    const thematic: BiblePlanDayInput[] = [
      { day: 5, label: 'Доверие', refs: [{ book_slug: 'psalms', chapter: 23 }] },
      { day: 9, label: 'Надежда', refs: [{ book_slug: 'psalms', chapter: 91 }] },
      { day: 9, label: 'Мир', refs: [{ book_slug: 'psalms', chapter: 46 }] },
    ];
    const out = rebalancePlanDays(thematic, 7);
    assert.deepEqual(out.map((d) => d.day), [1, 2, 3]);
    assert.deepEqual(out.map((d) => d.label), ['Доверие', 'Надежда', 'Мир']);
    assert.deepEqual(out.map((d) => d.refs), thematic.map((d) => d.refs));
  });

  it('перенумеровывает дни с пропусками даже в каноническом плане', () => {
    const gapped: BiblePlanDayInput[] = [
      { day: 1, refs: [{ book_slug: 'john', chapter: 1 }] },
      { day: 5, refs: [{ book_slug: 'john', chapter: 2 }] },
    ];
    const out = rebalancePlanDays(gapped, 2);
    assert.deepEqual(out.map((d) => d.day), [1, 2]);
  });
});

describe('buildPlanDayLabel', () => {
  it('одна глава', () => {
    assert.equal(buildPlanDayLabel([{ book_slug: 'john', chapter: 3 }]), 'Ин 3');
  });

  it('диапазон в одной книге', () => {
    assert.equal(
      buildPlanDayLabel([
        { book_slug: 'matthew', chapter: 1 },
        { book_slug: 'matthew', chapter: 4 },
      ]),
      'Мф 1–4',
    );
  });

  it('диапазон через границу книг', () => {
    assert.equal(
      buildPlanDayLabel([
        { book_slug: 'mark', chapter: 16 },
        { book_slug: 'luke', chapter: 2 },
      ]),
      'Мк 16 — Лк 2',
    );
  });

  it('стиховый диапазон показывает стих начала', () => {
    assert.equal(
      buildPlanDayLabel([
        { book_slug: 'john', chapter: 3, verse_start: 16, verse_end: 21 },
      ]),
      'Ин 3:16',
    );
  });
});
