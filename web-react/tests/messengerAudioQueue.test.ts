import { describe, expect, it } from 'vitest';

import {
  findNextMessengerAudioTrack,
  sortMessengerAudioTracks,
  type MessengerAudioTrackRegistration,
} from '../src/features/messenger/messengerAudioHost';
import { buildVoiceWaveBars } from '../src/features/messenger/components/VoiceMessageAttachment';

function track(
  partial: Partial<MessengerAudioTrackRegistration> &
    Pick<MessengerAudioTrackRegistration, 'ownerId' | 'sortKey'>,
): MessengerAudioTrackRegistration {
  return {
    src: `/api/messenger/messages/${partial.ownerId}/attachment-file`,
    conversationId: 'c1',
    variant: 'voice',
    ...partial,
  };
}

describe('messenger audio queue', () => {
  it('sorts tracks by sortKey ascending', () => {
    const sorted = sortMessengerAudioTracks([
      track({ ownerId: 'msg:3', sortKey: 30 }),
      track({ ownerId: 'msg:1', sortKey: 10 }),
      track({ ownerId: 'msg:2', sortKey: 20 }),
    ]);
    expect(sorted.map((t) => t.ownerId)).toEqual(['msg:1', 'msg:2', 'msg:3']);
  });

  it('finds the next voice in the same conversation', () => {
    const tracks = [
      track({ ownerId: 'msg:1', sortKey: 1 }),
      track({ ownerId: 'msg:2', sortKey: 2 }),
      track({ ownerId: 'msg:9', sortKey: 9, conversationId: 'other' }),
      track({ ownerId: 'msg:3', sortKey: 3 }),
    ];
    expect(findNextMessengerAudioTrack(tracks, 'msg:1', 'c1')?.ownerId).toBe('msg:2');
    expect(findNextMessengerAudioTrack(tracks, 'msg:2', 'c1')?.ownerId).toBe('msg:3');
    expect(findNextMessengerAudioTrack(tracks, 'msg:3', 'c1')).toBeNull();
    expect(findNextMessengerAudioTrack(tracks, 'msg:1', 'missing')).toBeNull();
  });

  it('builds stable waveform bars for a seed', () => {
    const a = buildVoiceWaveBars('msg:42', 12);
    const b = buildVoiceWaveBars('msg:42', 12);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    expect(a.every((n) => n >= 0.16 && n <= 1)).toBe(true);
  });
});
