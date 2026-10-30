import assert from 'node:assert/strict';

import { assistantMemberCanCompose, isAssistantChannelMetadata } from './assistantChatCompose';

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
    false,
  );
  assert.equal(
    assistantMemberCanCompose({
      metadata: { kind: 'access_requests', owner_member_id: '42' },
      memberId: 42,
      role: 'owner',
    }),
    false,
  );

  console.log('assistantChatCompose (unit) ok');
}

main();
