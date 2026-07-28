import assert from 'node:assert/strict';
import {
  buildServicePlanMondayMailingText,
  cleanupEmptySermonLabelLines,
  DEFAULT_SERVICE_PLAN_PUBLISHED_TEMPLATE,
  formatMailingPerson,
  formatSundayMailingHeading,
  isInternalProfileUsername,
  normalizeSermonFieldValue,
  parseSermonTopicFromBlockTitle,
  pickSermonFields,
  resolveChoirLineFromBlocks,
  resolveUpcomingSundayYmd,
} from './servicePlanMondayMailingService';

function run(): void {
  assert.equal(isInternalProfileUsername('member-57'), true);
  assert.equal(isInternalProfileUsername('@member-57'), false);
  assert.equal(isInternalProfileUsername('zhigunov72'), false);
  assert.equal(
    formatMailingPerson({ id: 57, mention: '@member-57', displayName: 'Иван Петров' }, 'name'),
    'Иван Петров',
  );
  assert.equal(
    formatMailingPerson({ id: 57, mention: '@member-57', displayName: 'Иван Петров' }, 'messenger'),
    '@[57]',
  );
  assert.equal(
    formatMailingPerson(
      { id: 57, mention: 'Иван', displayName: 'Иван Петров', telegramUsername: 'zhigunov72' },
      'telegram',
    ),
    '@zhigunov72',
  );
  assert.equal(
    formatMailingPerson(
      { id: 57, mention: 'Иван', displayName: 'Иван Петров', telegramUsername: null },
      'telegram',
    ),
    'Иван Петров',
  );
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
  assert.match(text, /1\. Проповедник — Жигунов/);
  assert.match(text, /Тема: «Четыре этапа нашей жизни»/);
  assert.match(text, /Текст: Быт\. 37:1-3; 37:23-24; 41:41-44/);
  assert.match(text, /2\. Группа прославления — Николай/);
  assert.match(text, /3\. Стих — Надежда/);
  assert.match(text, /4\. Хор петь не будет\./);
  assert.match(text, /5\. Ведущий — Дмитрий/);
  assert.match(text, /6\. Проповедник — Жигунов/);
  assert.match(text, /7\. Медиа-команда/);
  assert.match(
    text,
    /8\. Ссылка на программу: https:\/\/app\.church-tambov\.ru\/service-plan\/share\/bb479541-bec5-4931-b991-f65f0e8ce4cc/,
  );

  const custom = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@N_i_k_o_l_a_sss', displayName: 'Николай' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: '@zhigunovdm', displayName: 'Дмитрий' },
    sermonTopic: 'Тема',
    sermonScripture: 'Ин. 1:1',
    choirLine: 'Хор петь не будет.',
    template: '{{sunday_heading}}\nПроповедник: {{preacher}}\n{{share_url}}',
  });
  assert.equal(
    custom,
    'Воскресенье — 26 июля\nПроповедник: Жигунов\nhttps://app.church-tambov.ru/service-plan/share/bb479541-bec5-4931-b991-f65f0e8ce4cc',
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

  const rich = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    editToken: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@N_i_k_o_l_a_sss', displayName: 'Николай' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда Иванова' },
    leader: { id: 4, mention: '@zhigunovdm', displayName: 'Дмитрий' },
    sermonTopic: 'Тема',
    sermonScripture: 'Ин. 1:1',
    choirLine: 'Хор — @choir.',
    startTime: '10:00',
    status: 'draft',
    notes: 'Важно: репетиция в субботу',
    templateName: 'Воскресное',
    durationMinutes: 90,
    planId: 42,
    poemReader: { id: 5, mention: '@reader', displayName: 'Чтец' },
    poemAuthor: 'Пушкин',
    poemTheme: 'Вера',
    poemText: 'Текст стиха…',
    songs: ['Великий Бог', 'Ты достоин'],
    mediaTeamLines: ['Камера — Иван', 'Звук — Пётр'],
    template: [
      '{{sunday_heading}}',
      '{{date_short}} {{start_time}} {{status_ru}}',
      '{{preacher_name}} / {{preacher_mention}}',
      '{{songs_inline}} ({{songs_count}})',
      '{{poem_reader}} · {{poem_author}} · {{poem_theme}}',
      '{{media_team_inline}}',
      '{{notes}}',
      '{{edit_url}}',
      '{{share_url}}',
    ].join('\n'),
  });
  assert.match(rich, /26\.07\.2026 10:00 черновик/);
  assert.match(rich, /Жигунов \/ Жигунов/);
  assert.match(rich, /Великий Бог, Ты достоин \(2\)/);
  assert.match(rich, /Чтец · Пушкин · Вера/);
  assert.match(rich, /Камера — Иван, Звук — Пётр/);
  assert.match(rich, /Важно: репетиция в субботу/);
  assert.match(rich, /service-plan\/edit\/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/);

  const sermonRich = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@music', displayName: 'Музыка' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: '@lead', displayName: 'Ведущий' },
    sermonTopic: 'Четыре этапа',
    sermonScripture: 'Быт. 37',
    choirLine: 'Хор петь не будет.',
    sermonTitle: 'Проповедь на воскресенье',
    sermonBlockNotes: 'Нужна презентация до субботы',
    sermonBody: '<p>Тезис 1</p><p>Тезис 2</p>',
    sermonNoteAuthor: 'Жигунов',
    sermonNoteShareToken: '11111111-2222-3333-4444-555555555555',
    sermonHasNote: true,
    sermonAttachments: [{ name: 'slides.pptx', url: '/uploads/slides.pptx' }],
    template: [
      '{{sermon_title}}',
      '{{sermon_topic}} · {{sermon_scripture}}',
      '{{sermon_body}}',
      '{{sermon_presentation}}',
      '{{sermon_presentation_url}}',
      '{{sermon_note_url}}',
      '{{sermon_for_broadcast}}',
    ].join('\n'),
  });
  assert.match(sermonRich, /Проповедь на воскресенье/);
  assert.match(sermonRich, /Четыре этапа · Быт\. 37/);
  assert.match(sermonRich, /Тезис 1/);
  assert.match(sermonRich, /Тезис 2/);
  assert.match(sermonRich, /slides\.pptx/);
  assert.match(sermonRich, /https:\/\/app\.church-tambov\.ru\/uploads\/slides\.pptx/);
  assert.match(sermonRich, /sermon-notes\/share\/11111111-2222-3333-4444-555555555555/);
  assert.match(sermonRich, /Презентация: slides\.pptx/);

  const messengerPeople = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 57, mention: '@member-57', displayName: 'Жигунов' },
    music: { id: 57, mention: '@member-57', displayName: 'Жигунов' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 29, mention: '@member-29', displayName: 'Дмитрий' },
    sermonTopic: null,
    sermonScripture: null,
    choirLine: 'Хор петь не будет.',
    personStyle: 'messenger',
    template: '1. {{preacher}}\n5. {{leader}}',
  });
  assert.equal(messengerPeople, '1. @[57]\n5. @[29]');

const published = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@music', displayName: 'Николай' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: '@leader', displayName: 'Дмитрий' },
    sermonTopic: 'Тема',
    sermonScripture: 'Ин. 1:1',
    choirLine: 'Хор петь не будет.',
    template: DEFAULT_SERVICE_PLAN_PUBLISHED_TEMPLATE,
    personStyle: 'telegram',
  });
  assert.equal(
    published,
    'Финальная программа служения на 26 июля 2026 г. готова\n\nhttps://app.church-tambov.ru/service-plan/share/bb479541-bec5-4931-b991-f65f0e8ce4cc',
  );

  const publishedRich = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-07-26',
    shareToken: 'tok',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: {
      id: 1,
      mention: 'Жигунов',
      displayName: 'Жигунов',
      telegramUsername: 'zhigunov72',
    },
    music: { id: 2, mention: 'Николай', displayName: 'Николай' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: 'Дмитрий', displayName: 'Дмитрий' },
    sermonTopic: 'Четыре этапа',
    sermonScripture: null,
    choirLine: 'Хор петь не будет.',
    template:
      'Готово: {{sunday_heading}}\nПроповедник {{preacher}}\n{{sermon_topic_block}}{{share_url}}',
    personStyle: 'telegram',
  });
  assert.equal(
    publishedRich,
    'Готово: Воскресенье — 26 июля\nПроповедник @zhigunov72\nТема: «Четыре этапа»\nhttps://app.church-tambov.ru/service-plan/share/tok',
  );

  assert.equal(
    parseSermonTopicFromBlockTitle('Андрей Жигунов - Смерть, где твоё жало?'),
    'Смерть, где твоё жало?',
  );
  assert.equal(parseSermonTopicFromBlockTitle('Проповедь'), '');

  // Как в карточке программы: тема/писание в content_json, заголовок «Имя - Тема»
  const fromPlanCard = pickSermonFields(
    [
      {
        title: 'Андрей Жигунов - Смерть, где твоё жало?',
        block_type_code: 'sermon',
        content_json: {
          sermon_topic: 'Смерть, где твоё жало?',
          sermon_scripture: '1Кор.15:55-58',
        },
      },
    ],
    null,
  );
  assert.equal(fromPlanCard.topic, 'Смерть, где твоё жало?');
  assert.equal(fromPlanCard.scripture, '1Кор.15:55-58');

  // Без кода типа — находим блок по полям проповеди в content_json
  const byContentOnly = pickSermonFields(
    [
      {
        title: 'Андрей Жигунов - Смерть, где твоё жало?',
        block_type_code: null,
        content_json: {
          sermon_topic: 'Смерть, где твоё жало?',
          sermon_scripture: '1Кор.15:55-58',
        },
      },
    ],
    null,
  );
  assert.equal(byContentOnly.topic, 'Смерть, где твоё жало?');
  assert.equal(byContentOnly.scripture, '1Кор.15:55-58');

  // Тема только в заголовке карточки
  const fromTitleOnly = pickSermonFields(
    [
      {
        title: 'Андрей Жигунов - Смерть, где твоё жало?',
        block_type_code: 'sermon',
        content_json: { sermon_scripture: '1Кор.15:55-58' },
      },
    ],
    null,
  );
  assert.equal(fromTitleOnly.topic, 'Смерть, где твоё жало?');
  assert.equal(fromTitleOnly.scripture, '1Кор.15:55-58');

  // content_json пришёл строкой JSON
  const fromJsonString = pickSermonFields(
    [
      {
        title: 'Проповедь',
        block_type_code: 'sermon',
        content_json: JSON.parse(
          JSON.stringify({
            sermon_topic: 'Смерть, где твоё жало?',
            sermon_scripture: '1Кор.15:55-58',
          }),
        ) as Record<string, unknown>,
      },
    ],
    null,
  );
  assert.equal(fromJsonString.topic, 'Смерть, где твоё жало?');

  const mailingWithSermon = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-08-02',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 57, mention: 'Андрей', displayName: 'Андрей Жигунов' },
    music: { id: 36, mention: 'Элина', displayName: 'Элина Плотникова' },
    poem: { id: 52, mention: 'Чтец', displayName: 'Чтец' },
    leader: { id: 29, mention: 'Ведущий', displayName: 'Ведущий' },
    sermonTopic: 'Смерть, где твоё жало?',
    sermonScripture: '1Кор.15:55-58',
    choirLine: 'Хор петь не будет.',
  });
  assert.match(mailingWithSermon, /Тема: «Смерть, где твоё жало\?»/);
  assert.match(mailingWithSermon, /Текст: 1Кор\.15:55-58/);

  assert.equal(normalizeSermonFieldValue('текст не указан'), '');
  assert.equal(normalizeSermonFieldValue('тема не указана'), '');
  assert.equal(normalizeSermonFieldValue('  Быт. 1:1  '), 'Быт. 1:1');

  // Кастомный шаблон с «Тема:» / «Текст:» — пустые поля не должны оставлять мусор
  const emptySermonCustom = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-08-02',
    shareToken: 'bb479541-bec5-4931-b991-f65f0e8ce4cc',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: {
      id: 1,
      mention: 'Жигунов',
      displayName: 'Жигунов',
      telegramUsername: 'zhigunov72',
    },
    music: { id: 2, mention: 'Элина', displayName: 'Элина', telegramUsername: 'elinka1212' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда Шкирская' },
    leader: { id: 4, mention: 'Юрий', displayName: 'Юрий Малютин' },
    sermonTopic: null,
    sermonScripture: 'текст не указан',
    choirLine: 'Хор петь не будет.',
    personStyle: 'telegram',
    template: [
      '{{sunday_heading}}',
      '1. Проповедник — {{preacher}}',
      'Тема: {{sermon_topic}}',
      'Текст: {{sermon_scripture}}',
      '2. Группа прославления — {{music}}',
    ].join('\n'),
  });
  assert.match(emptySermonCustom, /^Воскресенье — 2 августа\n/);
  assert.match(emptySermonCustom, /1\. Проповедник — @zhigunov72\n2\. Группа прославления — @elinka1212/);
  assert.doesNotMatch(emptySermonCustom, /Тема:/);
  assert.doesNotMatch(emptySermonCustom, /Текст:/);
  assert.doesNotMatch(emptySermonCustom, /текст не указан/);

  // Стандартные блоки тоже скрывают пустую проповедь
  const emptySermonBlocks = buildServicePlanMondayMailingText({
    serviceDateYmd: '2026-08-02',
    shareToken: 'tok',
    publicOrigin: 'https://app.church-tambov.ru',
    preacher: { id: 1, mention: '@zhigunov72', displayName: 'Жигунов' },
    music: { id: 2, mention: '@music', displayName: 'Музыка' },
    poem: { id: 3, mention: 'Надежда', displayName: 'Надежда' },
    leader: { id: 4, mention: '@lead', displayName: 'Ведущий' },
    sermonTopic: '',
    sermonScripture: '',
    choirLine: 'Хор петь не будет.',
  });
  assert.doesNotMatch(emptySermonBlocks, /Тема:/);
  assert.doesNotMatch(emptySermonBlocks, /Текст:/);
  assert.match(emptySermonBlocks, /1\. Проповедник — Жигунов\n2\. Группа прославления/);

  assert.equal(
    cleanupEmptySermonLabelLines('1. Проповедник\nТема: \nТекст: текст не указан\n2. Группа'),
    '1. Проповедник\n2. Группа',
  );

  console.log('servicePlanMondayMailingService.test.ts: OK');
}

run();
