import assert from 'node:assert/strict';

import {
  calcTrend,
  normalizeAnalyticsPlatform,
  pageNameByKey,
} from './analyticsService';

function run(): void {
  // calcTrend
  assert.equal(calcTrend(0, 0), 0);
  assert.equal(calcTrend(10, 0), 100);
  assert.equal(calcTrend(0, 10), -100);
  assert.equal(calcTrend(150, 100), 50);
  assert.equal(calcTrend(50, 100), -50);
  assert.equal(calcTrend(100, 100), 0);
  assert.equal(calcTrend(103, 100), 3);

  // pageNameByKey: все разделы имеют русские имена
  assert.equal(pageNameByKey('dashboard'), 'Главная');
  assert.equal(pageNameByKey('feed'), 'Лента');
  assert.equal(pageNameByKey('prayer'), 'Молитва');
  assert.equal(pageNameByKey('bible'), 'Библия');
  assert.equal(pageNameByKey('messenger'), 'Чаты');
  assert.equal(pageNameByKey('songbook'), 'Песенник');
  assert.equal(pageNameByKey('studio'), 'Студия');
  assert.equal(pageNameByKey('service_planner'), 'Планировщик служений');
  assert.equal(pageNameByKey('schedules'), 'Расписание');
  assert.equal(pageNameByKey('events'), 'События');
  assert.equal(pageNameByKey('broadcast'), 'Трансляция');
  assert.equal(pageNameByKey('call'), 'Звонки');
  assert.equal(pageNameByKey('profile'), 'Профиль');
  assert.equal(pageNameByKey('settings'), 'Настройки');
  assert.equal(pageNameByKey('admin'), 'Админ');
  assert.equal(pageNameByKey('sermons'), 'Проповеди');
  assert.equal(pageNameByKey('my_sermons'), 'Мои проповеди');
  assert.equal(pageNameByKey('resources'), 'Ресурсы');
  assert.equal(pageNameByKey('unknown_key'), 'unknown_key');

  // normalizeAnalyticsPlatform
  assert.equal(normalizeAnalyticsPlatform('web'), 'web');
  assert.equal(normalizeAnalyticsPlatform('IOS'), 'ios');
  assert.equal(normalizeAnalyticsPlatform(' android '), 'android');
  assert.equal(normalizeAnalyticsPlatform(''), null);
  assert.equal(normalizeAnalyticsPlatform(null), null);
  assert.equal(normalizeAnalyticsPlatform(undefined), null);
  assert.equal(normalizeAnalyticsPlatform(42), null);
  assert.equal(normalizeAnalyticsPlatform('a'.repeat(21)), null);
  assert.equal(normalizeAnalyticsPlatform('bad platform!'), null);
  assert.equal(normalizeAnalyticsPlatform('<script>'), null);

  console.log('analyticsService tests OK');
}

run();
