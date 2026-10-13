import { describe, expect, it } from 'vitest';

import { formatInviteShareText } from '../src/features/calls/inviteShare';

describe('formatInviteShareText', () => {
  it('puts name and url on separate lines', () => {
    expect(formatInviteShareText('Молитва', 'https://app.example/call/join/abc')).toBe(
      'Молитва\nhttps://app.example/call/join/abc',
    );
  });

  it('falls back to Встреча when title empty', () => {
    expect(formatInviteShareText('  ', 'https://x.test/y')).toBe('Встреча\nhttps://x.test/y');
  });
});
