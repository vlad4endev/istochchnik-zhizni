import assert from 'node:assert/strict';

import {
  isVoiceRecordingUploadName,
  reconcileMessengerProxyContentType,
} from './messengerAttachmentMime';

function run(): void {
  assert.equal(isVoiceRecordingUploadName('voice-1710000000.webm'), true);
  assert.equal(isVoiceRecordingUploadName('path/voice-1.ogg'), true);
  assert.equal(isVoiceRecordingUploadName('choir.webm'), false);

  assert.equal(
    reconcileMessengerProxyContentType(
      { mimeType: 'audio/webm', fileName: 'voice-1.webm' },
      'video/webm',
    ),
    'audio/webm',
  );

  assert.equal(
    reconcileMessengerProxyContentType(
      { mimeType: 'video/webm', fileName: 'videonote-1.webm' },
      'audio/webm',
    ),
    'video/webm',
  );

  assert.equal(
    reconcileMessengerProxyContentType(
      { mimeType: null, fileName: 'voice-99.webm' },
      'application/octet-stream',
    ),
    'audio/webm',
  );

  assert.equal(
    reconcileMessengerProxyContentType(
      { mimeType: 'audio/mpeg', fileName: 'song.mp3' },
      'audio/mpeg',
    ),
    'audio/mpeg',
  );

  console.log('messengerAttachmentMime.test.ts: OK');
}

run();
