import assert from 'node:assert/strict';

import { getPrayerCyclePosition } from '../utils/isoDates';

/** Локальная копия формул цикла — без БД. */
function computeCycleIndex(cyclePosition: number, topicCount: number): number {
  if (topicCount <= 0) return 0;
  return Math.floor(cyclePosition / topicCount);
}

function dayIndexInCycle(cyclePosition: number, topicCount: number): number {
  if (topicCount <= 0) return 0;
  return ((cyclePosition % topicCount) + topicCount) % topicCount;
}

{
  const pos = getPrayerCyclePosition('2026-10-15', '2026-10-15');
  assert.equal(pos, 0);
  assert.equal(computeCycleIndex(pos, 3), 0);
  assert.equal(dayIndexInCycle(pos, 3), 0);
}

{
  const pos = getPrayerCyclePosition('2026-10-18', '2026-10-15');
  assert.equal(pos, 3);
  assert.equal(computeCycleIndex(pos, 3), 1);
  assert.equal(dayIndexInCycle(pos, 3), 0);
}

{
  const pos = getPrayerCyclePosition('2026-10-17', '2026-10-15');
  assert.equal(dayIndexInCycle(pos, 5), 2);
}

console.log('prayerWatchTopicsService.test.ts: OK');
