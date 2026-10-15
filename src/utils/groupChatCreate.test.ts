import assert from 'node:assert/strict';

import {
  GROUP_CHAT_TITLE_MAX,
  GroupChatTitleError,
  defaultGroupPermissions,
  memberMatchesNameQuery,
  nameSearchTokens,
  normalizeGroupChatTitle,
  parsePageLimit,
  parsePageOffset,
} from './groupChatCreate';

function main(): void {
  assert.equal(normalizeGroupChatTitle('  Молодёжь   служения  '), 'Молодёжь служения');
  assert.equal(normalizeGroupChatTitle('А'.repeat(GROUP_CHAT_TITLE_MAX)).length, GROUP_CHAT_TITLE_MAX);
  assert.throws(() => normalizeGroupChatTitle('   '), GroupChatTitleError);
  assert.throws(() => normalizeGroupChatTitle(12), GroupChatTitleError);
  assert.throws(() => normalizeGroupChatTitle('А'.repeat(GROUP_CHAT_TITLE_MAX + 1)), GroupChatTitleError);

  const perms = defaultGroupPermissions();
  assert.equal(perms.can_send_messages, true);
  assert.equal(perms.can_add_users, true);
  assert.equal(perms.can_manage_chat, false);

  assert.deepEqual(nameSearchTokens('  Иван   Петров '), ['иван', 'петров']);
  assert.deepEqual(nameSearchTokens('% _'), []);
  assert.equal(nameSearchTokens('а б в г д е ж').length, 6);

  assert.equal(
    memberMatchesNameQuery({ first_name: 'Иван', last_name: 'Петров', name: 'Иван' }, 'пет иван'),
    true,
  );
  assert.equal(
    memberMatchesNameQuery({ first_name: 'Иван', last_name: 'Петров', name: 'Иван' }, 'сидор'),
    false,
  );
  assert.equal(memberMatchesNameQuery({ name: 'Анна' }, ''), true);

  assert.equal(parsePageLimit('0', 50, 200), 50);
  assert.equal(parsePageLimit('500', 50, 200), 200);
  assert.equal(parsePageLimit('40', 50, 200), 40);
  assert.equal(parsePageOffset('-3'), 0);
  assert.equal(parsePageOffset('12'), 12);

  console.log('groupChatCreate (unit) ok');
}

main();
