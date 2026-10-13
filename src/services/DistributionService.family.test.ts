import assert from 'node:assert/strict';

import { resolveCuratorCandidatePool } from './DistributionService';

function run(): void {
  // Родственник с свободными слотами исключается; остаётся другой куратор.
  assert.deepEqual(
    resolveCuratorCandidatePool({
      participantId: 10,
      curatorIds: [1, 2, 3],
      curatorsWithSlots: [1, 2, 3],
      familyBlockedCuratorIds: new Set([2]),
    }).sort((a, b) => a - b),
    [1, 3],
  );

  // Сам участник-куратор не попадает в пул.
  assert.deepEqual(
    resolveCuratorCandidatePool({
      participantId: 2,
      curatorIds: [1, 2, 3],
      curatorsWithSlots: [1, 2, 3],
      familyBlockedCuratorIds: new Set(),
    }).sort((a, b) => a - b),
    [1, 3],
  );

  // Если у несемейных слотов нет — перегружаем несемейного, а не берём родственника.
  assert.deepEqual(
    resolveCuratorCandidatePool({
      participantId: 10,
      curatorIds: [1, 2, 3],
      curatorsWithSlots: [2],
      familyBlockedCuratorIds: new Set([2]),
    }).sort((a, b) => a - b),
    [1, 3],
  );

  // Крайний случай: все кураторы — родственники; пул = те, у кого ещё есть слоты.
  assert.deepEqual(
    resolveCuratorCandidatePool({
      participantId: 10,
      curatorIds: [1, 2],
      curatorsWithSlots: [1],
      familyBlockedCuratorIds: new Set([1, 2]),
    }),
    [1],
  );

  // Семья из карточки + self: остаётся единственный «чужой».
  assert.deepEqual(
    resolveCuratorCandidatePool({
      participantId: 1,
      curatorIds: [1, 2, 3],
      curatorsWithSlots: [1, 2, 3],
      familyBlockedCuratorIds: new Set([2]),
    }),
    [3],
  );

  console.log('DistributionService.family.test.ts: OK');
}

run();
