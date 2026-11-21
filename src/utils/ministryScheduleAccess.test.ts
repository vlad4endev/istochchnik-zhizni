import assert from 'node:assert/strict';

import {
  canManageMediaSchedule,
  canViewMediaSchedule,
  listAccessibleScheduleMinistries,
} from './ministryScheduleAccess';

// Участник без служения медиа не видит.
assert.equal(canViewMediaSchedule({}), false);
assert.equal(canViewMediaSchedule({ ministry_direction: 'Музыкальное служение', ministry_role: 'Гитарист' }), false);

// Направление «Медиа служение» открывает просмотр (как и раньше).
assert.equal(canViewMediaSchedule({ ministry_direction: 'Медиа служение' }), true);
assert.equal(canViewMediaSchedule({ ministry_direction: 'Музыкальное служение; Медиа служение' }), true);

// Роли каталога (админ, редактор, музыкант) видят (как и раньше).
assert.equal(canViewMediaSchedule({ canModerateCatalog: true }), true);

// Исправление: «Медиа менеджер» видит расписание, которым управляет, даже без направления.
assert.equal(canViewMediaSchedule({ ministry_role: 'Медиа менеджер' }), true);
assert.equal(canViewMediaSchedule({ ministry_role: 'Звукорежиссёр; медиа-менеджер' }), true);
assert.equal(canManageMediaSchedule({ ministry_role: 'Медиа менеджер', app_role: 'member' }), true);

// Список служений и эндпоинты не расходятся: одно правило для всех комбинаций.
const directions = [undefined, '', 'Медиа служение', 'Музыкальное служение', 'Воскресное служение'];
const roles = [undefined, '', 'Медиа менеджер', 'Гитарист', 'Ведущий'];
for (const ministry_direction of directions) {
  for (const ministry_role of roles) {
    for (const canModerateCatalog of [false, true]) {
      const input = { ministry_direction, ministry_role, canModerateCatalog };
      assert.equal(
        listAccessibleScheduleMinistries(input).includes('media'),
        canViewMediaSchedule(input),
        JSON.stringify(input),
      );
    }
  }
}

console.log('ministryScheduleAccess.test.ts: OK');
