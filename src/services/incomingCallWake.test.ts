import assert from 'node:assert/strict';

/**
 * Чистая логика payload для call wake — без Firebase/DB.
 * Дублирует контракт sendIncomingCallWake / sendFcmCallDataOnly.
 */

function buildIncomingCallWakeData(input: {
  callId: string;
  conversationId: string;
  callType: 'audio' | 'video';
  callerId: number;
  callerName: string;
  callerAvatar?: string | null;
  url: string;
}): Record<string, string> {
  return {
    type: 'incoming_call',
    callId: input.callId,
    conversationId: input.conversationId,
    callType: input.callType,
    callerId: String(input.callerId),
    callerName: input.callerName || 'Собеседник',
    callerAvatar: input.callerAvatar ?? '',
    url: input.url,
    tag: `call-${input.callId}`,
    renotify: 'true',
    requireInteraction: 'true',
  };
}

function clampRingTtl(ttlSec?: number): number {
  return Math.max(15, Math.min(180, ttlSec ?? 60));
}

async function main(): Promise<void> {
  const data = buildIncomingCallWakeData({
    callId: 'abc-123',
    conversationId: 'conv-1',
    callType: 'video',
    callerId: 42,
    callerName: 'Иван',
    callerAvatar: '/uploads/a.jpg',
    url: '/call/abc-123',
  });
  assert.equal(data.type, 'incoming_call');
  assert.equal(data.tag, 'call-abc-123');
  assert.equal(data.callType, 'video');
  assert.equal(data.callerId, '42');
  assert.equal(data.callerAvatar, '/uploads/a.jpg');

  assert.ok(!('token' in data));
  assert.ok(!Object.keys(data).some((k) => /secret|jwt|api/i.test(k)));

  assert.equal(clampRingTtl(5), 15);
  assert.equal(clampRingTtl(60), 60);
  assert.equal(clampRingTtl(999), 180);
  assert.equal(clampRingTtl(undefined), 60);

  console.log('incomingCallWake (unit) ok');
}

void main();
