import assert from 'node:assert/strict';

import { isSystemChatKind, parseAdminChatListFilter, systemChatKindSqlList } from './adminMessengerChats';

function main(): void {
  assert.equal(parseAdminChatListFilter(undefined), 'rooms');
  assert.equal(parseAdminChatListFilter(''), 'rooms');
  assert.equal(parseAdminChatListFilter('nope'), 'rooms');
  assert.equal(parseAdminChatListFilter('group'), 'group');
  assert.equal(parseAdminChatListFilter('channel'), 'channel');
  assert.equal(parseAdminChatListFilter('private'), 'private');
  assert.equal(parseAdminChatListFilter('empty'), 'empty');
  assert.equal(parseAdminChatListFilter('active'), 'active');
  assert.equal(parseAdminChatListFilter('all'), 'all');
  assert.equal(isSystemChatKind('assistant'), true);
  assert.equal(isSystemChatKind('access_requests'), true);
  assert.equal(isSystemChatKind('media_team'), true);
  assert.equal(isSystemChatKind('service_plan_planning'), true);
  assert.equal(isSystemChatKind(''), false);
  assert.equal(isSystemChatKind('group_created'), false);
  const sql = systemChatKindSqlList();
  assert.match(sql, /'assistant'/);
  assert.match(sql, /'access_requests'/);
  assert.equal(sql.includes('"'), false);
  console.log('adminMessengerChats (unit) ok');
}

main();
