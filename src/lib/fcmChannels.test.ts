import assert from 'node:assert/strict';
import test from 'node:test';

import { groupFcmTargetsByChannel, isFlutterDevice } from './fcmChannels';

test('приложение на Flutter узнаётся по device_id', () => {
  assert.equal(isFlutterDevice('flutter-ab12'), true);
  assert.equal(isFlutterDevice('android-xyz'), false);
  assert.equal(isFlutterDevice(null), false);
});

test('устройства делятся по каналам: прежние и _v2', () => {
  const groups = groupFcmTargetsByChannel(
    [
      { token: 't1', deviceId: 'flutter-1' },
      { token: 't2', deviceId: 'capacitor-9' },
      { token: 't3', deviceId: null },
      { token: 't4', deviceId: 'flutter-2' },
    ],
    'messages',
  );
  assert.deepEqual(groups, [
    { channelId: 'messages', tokens: ['t2', 't3'] },
    { channelId: 'messages_v2', tokens: ['t1', 't4'] },
  ]);
});

test('пустые группы не возвращаются', () => {
  assert.deepEqual(groupFcmTargetsByChannel([{ token: 'a', deviceId: 'flutter-1' }], 'general'), [
    { channelId: 'general_v2', tokens: ['a'] },
  ]);
  assert.deepEqual(groupFcmTargetsByChannel([], 'general'), []);
});
