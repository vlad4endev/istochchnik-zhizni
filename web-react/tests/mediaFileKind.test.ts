import { describe, expect, it } from 'vitest';

import { inferMediaFileKind, looksLikeVideoUrl } from '../src/lib/mediaFileKind';

describe('inferMediaFileKind', () => {
  it('uses MIME when present', () => {
    expect(inferMediaFileKind({ type: 'video/mp4', name: 'x.bin' })).toBe('video');
    expect(inferMediaFileKind({ type: 'image/jpeg', name: 'x.bin' })).toBe('image');
  });

  it('falls back to extension when MIME is empty', () => {
    expect(inferMediaFileKind({ type: '', name: 'clip.MOV' })).toBe('video');
    expect(inferMediaFileKind({ type: '', name: 'photo.JPEG' })).toBe('image');
    expect(inferMediaFileKind({ type: 'application/octet-stream', name: 'story.webm' })).toBe('video');
  });

  it('returns null for unsupported', () => {
    expect(inferMediaFileKind({ type: '', name: 'doc.pdf' })).toBeNull();
  });
});

describe('looksLikeVideoUrl', () => {
  it('detects video extensions in paths', () => {
    expect(looksLikeVideoUrl('https://cdn.example/storage/v1/object/public/user-media/a.mp4')).toBe(true);
    expect(looksLikeVideoUrl('/uploads/x.mov')).toBe(true);
    expect(looksLikeVideoUrl('https://cdn.example/a.jpg')).toBe(false);
  });
});
