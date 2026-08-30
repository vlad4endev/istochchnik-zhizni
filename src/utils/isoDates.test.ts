import assert from 'node:assert/strict';
import {
  buildPrayerCycleOrderWithMemberOnDayIndex,
  computePrayerCycleAnchorStartDate,
  dayIndexInCycle,
  getMondayBasedDayIndex,
  getPrayerCyclePosition,
} from './isoDates';

function run(): void {
  const dates = [
    '2026-08-24', // пн
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
    '2026-08-30', // вс
    '2026-08-31',
  ];

  let reachableOk = 0;
  let unreachable = 0;

  for (const d of dates) {
    for (const n of [1, 2, 3, 5, 7, 10, 12, 14, 20, 31]) {
      for (let i = 0; i < n; i++) {
        const start = computePrayerCycleAnchorStartDate(d, i, n);
        if (start == null) {
          unreachable++;
          // На недостижимых индексах порядок с сегодняшним слотом всё равно ставит нужного человека.
          const ids = Array.from({ length: n }, (_, k) => k + 1);
          const todayIdx = dayIndexInCycle(
            getPrayerCyclePosition(d, '2025-01-06'), // любой понедельник в прошлом
            n,
          );
          const order = buildPrayerCycleOrderWithMemberOnDayIndex(ids, i + 1, todayIdx);
          assert.ok(order);
          assert.equal(order![todayIdx], i + 1);
          continue;
        }
        const idx = dayIndexInCycle(getPrayerCyclePosition(d, start), n);
        assert.equal(
          idx,
          i,
          `anchor=${d} rosterIndex=${i} n=${n} start=${start} gotIdx=${idx} dow=${getMondayBasedDayIndex(d)}`,
        );
        reachableOk++;
      }
    }
  }

  // Воскресенье + 7 участников: через start_date доступен только индекс 6.
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-30', 0, 7), null);
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-30', 3, 7), null);
  const sun7 = computePrayerCycleAnchorStartDate('2026-08-30', 6, 7);
  assert.ok(sun7);
  assert.equal(dayIndexInCycle(getPrayerCyclePosition('2026-08-30', sun7!), 7), 6);

  // Понедельник + 7: только индекс 0.
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-31', 0, 7), '2026-08-31');
  assert.equal(computePrayerCycleAnchorStartDate('2026-08-31', 1, 7), null);

  const rotated = buildPrayerCycleOrderWithMemberOnDayIndex([10, 20, 30, 40], 20, 2);
  assert.deepEqual(rotated, [40, 10, 20, 30]);
  assert.equal(rotated![2], 20);

  console.log(
    `isoDates.test.ts: OK (reachable=${reachableOk}, unreachable-covered=${unreachable})`,
  );
}

run();
