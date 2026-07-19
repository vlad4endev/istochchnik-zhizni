import assert from 'node:assert/strict';
import { buildMemberJoinedPushCopy } from './memberJoinedNotifyService';

function run(): void {
  const copy = buildMemberJoinedPushCopy({
    id: 42,
    first_name: 'Анна',
    last_name: 'Иванова',
    name: 'Анна Иванова',
  });
  assert.equal(copy.title, 'Новый участник');
  assert.equal(copy.body, 'Анна Иванова теперь в приложении. Напишите ему!');
  assert.equal(copy.draftConversationId, 'draft:42');
  assert.match(copy.url, /conversationId=draft%3A42/);

  const fallback = buildMemberJoinedPushCopy({
    id: 7,
    first_name: '',
    last_name: null,
    name: 'Пётр',
  });
  assert.equal(fallback.body, 'Пётр теперь в приложении. Напишите ему!');

  console.log('memberJoinedNotifyService.test.ts: OK');
}

run();
