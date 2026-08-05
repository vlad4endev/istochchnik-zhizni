import assert from 'node:assert/strict';
import {
  buildPreacherSermonDataReminderText,
  isSermonDataComplete,
  resolvePreacherReminderDaysBefore,
  resolvePreacherReminderTargetDateYmd,
} from './preacherSermonDataReminderService';

function run(): void {
  assert.equal(isSermonDataComplete('', ''), false);
  assert.equal(isSermonDataComplete('Тема', ''), false);
  assert.equal(isSermonDataComplete('', 'Ин. 3:16'), false);
  assert.equal(isSermonDataComplete('Тема не указана', 'текст не указан'), false);
  assert.equal(isSermonDataComplete('Четыре этапа', 'Ин. 3:16'), true);

  const text = buildPreacherSermonDataReminderText({
    serviceDateYmd: '2026-08-16',
    preacherName: 'Иван Петров',
    shareUrl: 'https://app.church-tambov.ru/service-plan/share/tok',
  });
  assert.match(text, /Иван Петров, напоминание/);
  assert.match(text, /Воскресенье — 16 августа/);
  assert.match(text, /внесите данные по проповеди/);
  assert.match(text, /https:\/\/app\.church-tambov\.ru\/service-plan\/share\/tok/);

  const withoutName = buildPreacherSermonDataReminderText({
    serviceDateYmd: '2026-08-16',
  });
  assert.match(withoutName, /^Напоминание:/);

  // 1.5 недели ≈ 11 дней: среда 5 августа → цель воскресенье 16 августа.
  const target = resolvePreacherReminderTargetDateYmd(
    new Date('2026-08-05T10:00:00+03:00'),
    'Europe/Moscow',
    11,
  );
  assert.equal(target, '2026-08-16');

  const prev = process.env.PREACHER_SERMON_DATA_REMINDER_DAYS_BEFORE;
  process.env.PREACHER_SERMON_DATA_REMINDER_DAYS_BEFORE = '10';
  assert.equal(resolvePreacherReminderDaysBefore(), 10);
  if (prev === undefined) {
    delete process.env.PREACHER_SERMON_DATA_REMINDER_DAYS_BEFORE;
  } else {
    process.env.PREACHER_SERMON_DATA_REMINDER_DAYS_BEFORE = prev;
  }

  console.log('preacherSermonDataReminderService.test.ts: ok');
}

run();
