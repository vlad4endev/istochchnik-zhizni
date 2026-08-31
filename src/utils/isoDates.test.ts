import assert from 'node:assert/strict';
import {
  computePrayerCycleAnchorStartDate,
  dayIndexInCycle,
  getPrayerCyclePosition,
} from './isoDates';

function run(): void {
  const dates = [
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
    '2026-08-31',
  ];

  let ok = 0;
  for (const d of dates) {
    for (const n of [1, 2, 3, 5, 7, 10, 12, 14, 20, 31]) {
      for (let i = 0; i < n; i++) {
        const start = computePrayerCycleAnchorStartDate(d, i, n);
        const idx = dayIndexInCycle(getPrayerCyclePosition(d, start), n);
        assert.equal(idx, i, `anchor=${d} rosterIndex=${i} n=${n} start=${start} gotIdx=${idx}`);
        ok++;
      }
    }
  }

  // Алфавитный список не трогаем: start = today − index.
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-30', 0, 7), '2026-08-30');
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-30', 3, 7), '2026-08-27');
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-31', 1, 7), '2026-08-30');

  console.log(`isoDates.test.ts: OK (cases=${ok})`);
}

run();
