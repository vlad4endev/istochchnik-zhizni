import { describe, expect, it } from 'vitest';

import { buildVoiceWaveBars } from '../src/features/messenger/components/VoiceMessageAttachment';

describe('buildVoiceWaveBars', () => {
  it('returns stable bars for the same seed', () => {
    const a = buildVoiceWaveBars('msg-42', 12);
    const b = buildVoiceWaveBars('msg-42', 12);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(a.every((n) => n >= 0.14 && n <= 1)).toBe(true);
  });

  it('varies by seed', () => {
    const a = buildVoiceWaveBars('a', 16);
    const b = buildVoiceWaveBars('b', 16);
    expect(a).not.toEqual(b);
  });
});
