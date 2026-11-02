import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isProfileMp4FamilyMagic,
  isProfileVideoMagic,
  isProfileWebmMagic,
  validateAndNormalizeProfileMedia,
} from './profileMediaUpload';

function ftypBuffer(brand: string): Buffer {
  const buf = Buffer.alloc(16, 0);
  buf.writeUInt32BE(16, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand.padEnd(4, '\0').slice(0, 4), 8, 'ascii');
  return buf;
}

function jpegBuffer(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
}

function webmBuffer(): Buffer {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]);
}

function fakeFile(partial: {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
}): Express.Multer.File {
  return {
    fieldname: 'media',
    originalname: partial.originalname ?? 'file.bin',
    encoding: '7bit',
    mimetype: partial.mimetype ?? 'application/octet-stream',
    size: partial.buffer.length,
    buffer: partial.buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as unknown as Express.Multer.File['stream'],
  };
}

describe('profileMediaUpload magic', () => {
  it('accepts common and phone MP4 brands', () => {
    for (const brand of ['isom', 'mp42', 'm4v', 'qt  ', '3gp4', 'XAVC', 'iso5']) {
      assert.equal(isProfileMp4FamilyMagic(ftypBuffer(brand)), true, brand);
      assert.equal(isProfileVideoMagic(ftypBuffer(brand)), true, brand);
    }
  });

  it('rejects HEIC/AVIF still-image brands', () => {
    for (const brand of ['heic', 'mif1', 'avif']) {
      assert.equal(isProfileMp4FamilyMagic(ftypBuffer(brand)), false, brand);
    }
  });

  it('detects WebM EBML header', () => {
    assert.equal(isProfileWebmMagic(webmBuffer()), true);
    assert.equal(isProfileVideoMagic(webmBuffer()), true);
  });

  it('normalizes empty MIME for video magic to video/*', () => {
    const file = fakeFile({ buffer: ftypBuffer('isom'), mimetype: '', originalname: 'clip.mp4' });
    const err = validateAndNormalizeProfileMedia([file]);
    assert.equal(err, null);
    assert.match(file.mimetype, /^video\//);
  });

  it('normalizes octet-stream JPEG to image/jpeg', () => {
    const file = fakeFile({ buffer: jpegBuffer(), mimetype: 'application/octet-stream', originalname: 'a.jpg' });
    const err = validateAndNormalizeProfileMedia([file]);
    assert.equal(err, null);
    assert.equal(file.mimetype, 'image/jpeg');
  });

  it('rejects unknown binary', () => {
    const file = fakeFile({ buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]), mimetype: 'video/mp4' });
    const err = validateAndNormalizeProfileMedia([file]);
    assert.ok(err);
  });
});
