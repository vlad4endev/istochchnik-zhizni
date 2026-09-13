import assert from 'assert';
import {
  DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS,
  mergeMusicScheduleMailingPatch,
  normalizeMusicScheduleMailingSettings,
} from './musicScheduleMailing';
import { buildMusicScheduleMailingText } from '../services/musicScheduleMailingService';

function testNormalizeDefaults(): void {
  const doc = normalizeMusicScheduleMailingSettings(null);
  assert.strictEqual(doc.weekday, 4);
  assert.strictEqual(doc.enabled, false);
  assert.strictEqual(doc.target, 'upcoming');
  assert.ok(doc.template.includes('{{assignments}}'));
}

function testNormalizePatch(): void {
  const next = mergeMusicScheduleMailingPatch(DEFAULT_MUSIC_SCHEDULE_MAILING_SETTINGS, {
    enabled: true,
    weekday: 3,
    chat_id: '-100123',
    time_hhmm: '09:30',
  });
  assert.strictEqual(next.enabled, true);
  assert.strictEqual(next.weekday, 3);
  assert.strictEqual(next.chat_id, '-100123');
  assert.strictEqual(next.time_hhmm, '09:30');
}

function testBuildText(): void {
  const text = buildMusicScheduleMailingText({
    template: 'Команда на {{service_date}}\n\n{{assignments}}',
    lineTemplate: '{{role}} — {{member}}',
    serviceDate: '2026-09-20',
    serviceTitle: 'Воскресное служение',
    serviceTime: '10:00',
    timeZone: 'Europe/Moscow',
    lines: [
      { role: 'Лидер поклонения', member: 'Иван Иванов', status: 'assigned', vacant: false },
      { role: 'Клавиши', member: 'Мария Петрова', status: 'confirmed', vacant: false },
    ],
  });
  assert.ok(text.includes('Команда на 2026-09-20'));
  assert.ok(text.includes('Лидер поклонения — Иван Иванов'));
  assert.ok(text.includes('Клавиши — Мария Петрова'));
}

testNormalizeDefaults();
testNormalizePatch();
testBuildText();
console.log('musicScheduleMailing types/service smoke tests: ok');
