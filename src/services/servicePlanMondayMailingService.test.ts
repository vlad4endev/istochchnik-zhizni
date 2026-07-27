import assert from 'node:assert/strict';
import {
  buildServicePlanMondayMailingText,
  formatSundayMailingHeading,
  resolveChoirLineFromBlocks,
  resolveUpcomingSundayYmd,
} from './servicePlanMondayMailingService';

function run(): void {
  assert.equal(formatSundayMailingHeading('2026-07-26'), 'Воскресенье — 26 июля');

  // Понедельник 27 июля 2026 → ближайшее воскресенье 2 августа
  const monday = new Date('2026-07-27T07:00:00.000Z');
  assert.equal(resolveUpcomingSundayYmd(monday, 'Europe/Moscow'), '2026-08-02');

  // Воскресенье остаётся этим же днём
  const sunday = new Date('2026-07-26T07:00:00.000Z');
  assert.equal(resolveUpcomingSundayYmd(sunday, 'Europe/Moscow'), '2026-07-26');

  const text = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@N_i_k_o_l_a_sss', displayName: 'Николай' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: '@zhigunovdm', displayName: 'Дмитрий' },
    sermonTopic: 'Четыре этапа нашей жизни',
    sermonScripture: 'Быт. 37:1-3; 37:23-24; 41:41-44',
    choirLine: 'Хор петь не будет.',
  });

  assert.match(text, /^Воскресенье — 26 июля\n/);
  assert.match(text, /1\. Проповедник — @zhigunov72/);
  assert.match(text, /Тема: «Четыре этапа нашей жизни»/);
  assert.match(text, /Текст: Быт\. 37:1-3; 37:23-24; 41:41-44/);
  assert.match(text, /2\. Группа прославления — @N_i_k_o_l_a_sss/);
  assert.match(text, /3\. Стих — Надежда/);
  assert.match(text, /4\. Хор петь не будет\./);
  assert.match(text, /5\. Ведущий — @zhigunovdm/);
  assert.match(text, /6\. Проповедник — @zhigunov72/);
  assert.match(text, /7\. Медиа-команда/);
  assert.match(
    text,
    /8\. Ссылка на программу: https:\/\/app\.church-tambov\.ru\/service-plan\/share\/bb479541-bec5-4931-b991-f65f0e8ce4cc/,
  );

  assert.equal(resolveChoirLineFromBlocks([], new Map()), 'Хор петь не будет.');
  assert.equal(
    resolveChoirLineFromBlocks(
      [{ title: 'Хор', assigned_member_id: 9, content_json: {}, block_type_code: 'custom' }],
      new Map([[9, '@choir_lead']]),
    ),
    'Хор — @choir_lead.',
  );
  assert.equal(
    resolveChoirLineFromBlocks(
      [
        {
          title: 'Хор',
          assigned_member_id: null,
          content_json: { notes: 'петь не будет' },
          block_type_code: 'custom',
        },
      ],
      new Map(),
    ),
    'Хор петь не будет.',
  );

  console.log('servicePlanMondayMailingService.test.ts: OK');
}

run();
