import assert from 'node:assert/strict';
import {
  formatCoordinatorDateRu,
  missingNeedVars,
} from './coordinatorTelegramTemplateVars';

function run(): void {
  assert.equal(formatCoordinatorDateRu('2026-07-28', 'weekday'), 'вторник');
  assert.match(formatCoordinatorDateRu('2026-07-28', 'short'), /28/);
  assert.match(formatCoordinatorDateRu('2026-07-28', 'long'), /28/);

  const vars = missingNeedVars({
    title: 'Нет нужды',
    memberName: 'Иван Иванов',
    dateYmd: '2026-07-28',
    coordinatorName: 'Мария',
    cycleIndex: 5,
    weekKind: 'current',
  });
  assert.equal(vars.member_name, 'Иван Иванов');
  assert.equal(vars.coordinator_name, 'Мария');
  assert.equal(vars.cycle_index, '5');
  assert.equal(vars.date, '2026-07-28');
  assert.equal(vars.weekday, 'вторник');
  assert.equal(vars.weekday_cap, 'Вторник');
  assert.ok(vars.week_range.includes('—'));

  console.log('coordinatorTelegramTemplateVars.test.ts: OK');
}

run();
