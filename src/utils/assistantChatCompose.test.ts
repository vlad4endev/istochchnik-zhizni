import assert from 'node:assert/strict';

import { canAccessMessengerAssistant } from '../types/appRole';
import {
  assistantMemberCanCompose,
  isAssistantChannelMetadata,
  shouldExposeAssistantConversation,
} from './assistantChatCompose';

function main(): void {
  const own = { kind: 'assistant', owner_member_id: '42' };

  assert.equal(isAssistantChannelMetadata(own), true);
  assert.equal(isAssistantChannelMetadata(JSON.stringify(own)), true);
  assert.equal(isAssistantChannelMetadata('not-json'), false);
  assert.equal(isAssistantChannelMetadata({ kind: 'access_requests' }), false);
  assert.equal(isAssistantChannelMetadata(null), false);
  assert.equal(isAssistantChannelMetadata([]), false);

  assert.equal(
    assistantMemberCanCompose({ metadata: own, memberId: 42, role: 'member' }),
    true,
    'владелец по metadata может писать даже с ролью member',
  );
  assert.equal(
    assistantMemberCanCompose({ metadata: own, memberId: 7, role: 'owner' }),
    true,
  );
  assert.equal(
    assistantMemberCanCompose({ metadata: own, memberId: 7, role: 'admin' }),
    true,
  );
  assert.equal(
    assistantMemberCanCompose({ metadata: own, memberId: 7, role: 'member' }),
    false,
    'чужой участник не пишет в личный ИИ-чат',
  );
  assert.equal(
    assistantMemberCanCompose({
      metadata: JSON.stringify({ kind: 'assistant', owner_member_id: 42 }),
      memberId: 42,
      role: 'member',
    }),
    true,
  );
  assert.equal(
    assistantMemberCanCompose({
      metadata: { kind: 'assistant' },
      memberId: 42,
      role: 'member',
    }),
    true,
    'личный канал без owner_member_id всё равно можно писать',
  );
  assert.equal(
    assistantMemberCanCompose({
      metadata: { kind: 'access_requests', owner_member_id: '42' },
      memberId: 42,
      role: 'owner',
    }),
    false,
  );

  assert.equal(canAccessMessengerAssistant('member'), true);
  assert.equal(canAccessMessengerAssistant('minister'), true);
  assert.equal(canAccessMessengerAssistant('pastor'), true);
  assert.equal(canAccessMessengerAssistant('musician'), true);
  assert.equal(canAccessMessengerAssistant('editor'), true);
  assert.equal(canAccessMessengerAssistant('admin'), true);
  assert.equal(canAccessMessengerAssistant(['parishioner', 'member']), true);
  assert.equal(canAccessMessengerAssistant('parishioner'), false);
  assert.equal(canAccessMessengerAssistant(['parishioner']), false);
  assert.equal(canAccessMessengerAssistant([]), true);

  assert.equal(
    shouldExposeAssistantConversation({
      metadata: own,
      title: 'ИИ помощник',
      assistantAllowed: false,
      memberId: 42,
      role: 'owner',
    }),
    false,
    'прихожанину чат не показываем',
  );
  assert.equal(
    shouldExposeAssistantConversation({
      metadata: undefined,
      title: 'ИИ помощник',
      assistantAllowed: false,
      memberId: 42,
    }),
    false,
  );
  assert.equal(
    shouldExposeAssistantConversation({
      metadata: own,
      title: 'ИИ помощник',
      assistantAllowed: true,
      memberId: 42,
      role: 'member',
    }),
    true,
  );
  assert.equal(
    shouldExposeAssistantConversation({
      metadata: own,
      title: 'ИИ помощник',
      assistantAllowed: true,
      memberId: 7,
      role: 'member',
    }),
    false,
    'чужой ИИ-чат не показываем',
  );
  assert.equal(
    shouldExposeAssistantConversation({
      metadata: { kind: 'group' },
      title: 'Молодёжь',
      assistantAllowed: false,
      memberId: 1,
    }),
    true,
  );

  console.log('assistantChatCompose (unit) ok');
}

main();
