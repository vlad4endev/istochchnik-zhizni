import assert from 'node:assert/strict';

import { objectPathFromPublicStorageUrl } from '../lib/supabaseStorage';
import {
  classifyChatMediaForCompress,
  isWorthKeepingCompressed,
  normalizeObjectPath,
} from './chatMediaCompressHelpers';

assert.equal(classifyChatMediaForCompress({ payloadType: 'audio', mimeType: 'audio/mpeg' }), 'audio');
assert.equal(classifyChatMediaForCompress({ payloadType: 'video_note' }), 'video');
assert.equal(classifyChatMediaForCompress({ payloadType: 'image', mimeType: 'image/jpeg' }), 'image');
assert.equal(classifyChatMediaForCompress({ payloadType: 'image', mimeType: 'image/gif' }), 'skip');
assert.equal(classifyChatMediaForCompress({ payloadType: 'file', mimeType: 'application/pdf' }), 'skip');
assert.equal(classifyChatMediaForCompress({ payloadType: 'file', fileName: 'clip.mp4' }), 'video');

assert.equal(isWorthKeepingCompressed(1000, 900), true);
assert.equal(isWorthKeepingCompressed(1000, 990), false);
assert.equal(isWorthKeepingCompressed(1000, 1000), false);

assert.equal(normalizeObjectPath('a/b.jpg'), 'a/b.jpg');
assert.equal(normalizeObjectPath('/a/b.jpg'), 'a/b.jpg');
assert.equal(normalizeObjectPath('a/../b.jpg'), undefined);

assert.equal(
  objectPathFromPublicStorageUrl(
    'https://example.com/storage/v1/object/public/chat/12/abc.jpg',
    'chat',
  ),
  '12/abc.jpg',
);
assert.equal(objectPathFromPublicStorageUrl('https://example.com/other', 'chat'), undefined);

console.log('chatMediaCompressHelpers.test.ts: ok');
