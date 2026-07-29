import assert from 'node:assert/strict';
import {
  normalizeCoordinatorTelegramScenariosDocument,
  scenarioWantsChat,
  scenarioWantsDm,
  applyCoordinatorBodyTemplate,
  describeDayOffset,
} from './coordinatorTelegramScenarios';

function run(): void {
  const empty = normalizeCoordinatorTelegramScenariosDocument(null);
  assert.equal(empty.version, 1);
  assert.equal(empty.timezone, 'Europe/Moscow');
  assert.equal(empty.scenarios.length, 4);
  const tomorrow = empty.scenarios.find((s) => s.id === 'missing_need_tomorrow')!;
  assert.equal(tomorrow.repeat, 'daily');
  assert.equal(tomorrow.dayOffset, 1);
  const today = empty.scenarios.find((s) => s.id === 'missing_need_today')!;
  assert.equal(today.repeat, 'daily');
  assert.equal(today.dayOffset, 0);
  const week = empty.scenarios.find((s) => s.id === 'week_list')!;
  assert.equal(week.repeat, 'weekly');

  // Legacy saved JSON without repeat/dayOffset → daily for missing need
  const legacy = normalizeCoordinatorTelegramScenariosDocument({
    timezone: 'Europe/Moscow',
    scenarios: [
      { id: 'missing_need_tomorrow', enabled: true, target: 'dm', time: '18:00', weekDay: 0 },
      { id: 'week_list', enabled: true, target: 'chat', time: '09:00', weekDay: 1 },
    ],
  });
  assert.equal(
    legacy.scenarios.find((s) => s.id === 'missing_need_tomorrow')!.repeat,
    'daily',
  );
  assert.equal(
    legacy.scenarios.find((s) => s.id === 'missing_need_tomorrow')!.dayOffset,
    1,
  );
  assert.equal(legacy.scenarios.find((s) => s.id === 'week_list')!.repeat, 'weekly');

  const custom = normalizeCoordinatorTelegramScenariosDocument({
    scenarios: [
      {
        id: 'missing_need_tomorrow',
        repeat: 'weekly',
        dayOffset: 2,
        weekDay: 3,
        time: '17:00',
      },
    ],
  });
  const m = custom.scenarios.find((s) => s.id === 'missing_need_tomorrow')!;
  assert.equal(m.repeat, 'weekly');
  assert.equal(m.dayOffset, 2);
  assert.equal(m.weekDay, 3);

  assert.equal(describeDayOffset(0), 'в день цикла (сегодня)');
  assert.equal(describeDayOffset(1), 'за 1 день до дня цикла (завтра)');
  assert.match(describeDayOffset(3), /3/);

  assert.equal(scenarioWantsDm('dm_and_chat'), true);
  assert.equal(scenarioWantsChat('chat'), true);

  assert.equal(
    applyCoordinatorBodyTemplate('{{member_name}} offset={{day_offset}}', {
      member_name: 'Иван',
      day_offset: '1',
    }),
    'Иван offset=1',
  );

  console.log('coordinatorTelegramScenarios.test.ts: OK');
}

run();
