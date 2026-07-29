import assert from 'node:assert/strict';
import {
  normalizeCoordinatorTelegramScenariosDocument,
  scenarioWantsChat,
  scenarioWantsDm,
  applyCoordinatorBodyTemplate,
} from './coordinatorTelegramScenarios';

function run(): void {
  const empty = normalizeCoordinatorTelegramScenariosDocument(null);
  assert.equal(empty.version, 1);
  assert.equal(empty.timezone, 'Europe/Moscow');
  assert.equal(empty.scenarios.length, 4);
  assert.deepEqual(
    empty.scenarios.map((s) => s.id),
    ['assignment', 'missing_need_tomorrow', 'missing_need_today', 'week_list'],
  );

  const merged = normalizeCoordinatorTelegramScenariosDocument({
    timezone: 'Europe/Samara',
    scenarios: [
      { id: 'assignment', enabled: false, target: 'dm_and_chat', title: '  Назначение  ' },
      { id: 'unknown_x', enabled: true },
      { id: 'week_list', time: '11:30', weekDay: 2, customBody: 'Список: {participants}' },
    ],
  });
  assert.equal(merged.timezone, 'Europe/Samara');
  const assignment = merged.scenarios.find((s) => s.id === 'assignment')!;
  assert.equal(assignment.enabled, false);
  assert.equal(assignment.target, 'dm_and_chat');
  assert.equal(assignment.title, 'Назначение');
  const week = merged.scenarios.find((s) => s.id === 'week_list')!;
  assert.equal(week.time, '11:30');
  assert.equal(week.weekDay, 2);
  assert.equal(week.customBody, 'Список: {participants}');
  assert.equal(
    merged.scenarios.some((s) => (s.id as string) === 'unknown_x'),
    false,
  );

  assert.equal(scenarioWantsDm('dm'), true);
  assert.equal(scenarioWantsChat('dm'), false);
  assert.equal(scenarioWantsDm('chat'), false);
  assert.equal(scenarioWantsChat('chat'), true);
  assert.equal(scenarioWantsDm('dm_and_chat'), true);
  assert.equal(scenarioWantsChat('dm_and_chat'), true);

  assert.equal(
    applyCoordinatorBodyTemplate('{memberName} — {date}', {
      memberName: 'Иван',
      date: '2026-07-30',
    }),
    'Иван — 2026-07-30',
  );

  console.log('coordinatorTelegramScenarios.test.ts: OK');
}

run();
