import assert from 'node:assert/strict';

import { decodeMultipartFilename } from './sermonAttachmentUploadService';

function run(): void {
  const original = 'Благодарность в молитве.pptx';
  const mojibake = Buffer.from(original, 'utf8').toString('latin1');
  assert.notEqual(mojibake, original);
  assert.equal(decodeMultipartFilename(mojibake), original);
  assert.equal(decodeMultipartFilename(original), original);
  assert.equal(decodeMultipartFilename('slides.pptx'), 'slides.pptx');
  assert.equal(decodeMultipartFilename(''), '');
  console.log('sermonAttachmentUploadService.test.ts: ok');
}

run();
