import { describe, expect, it } from 'vitest';
import { messageCountsAsUnreadForCurrentUser } from '../src/features/messenger/chatStoreWsBatch';

describe('messageCountsAsUnreadForCurrentUser', () => {
  it('counts ordinary unread messages from others', () => {
    expect(
      messageCountsAsUnreadForCurrentUser(
        { is_read: false, sender_id: 2, payload_type: 'text' },
        7,
      ),
    ).toBe(true);
  });

  it('ignores own messages and already-read ones', () => {
    expect(
      messageCountsAsUnreadForCurrentUser(
        { is_read: false, sender_id: 7, payload_type: 'text' },
        7,
      ),
    ).toBe(false);
    expect(
      messageCountsAsUnreadForCurrentUser(
        { is_read: true, sender_id: 2, payload_type: 'text' },
        7,
      ),
    ).toBe(false);
  });

  it('matches server filter: system/notification/access_request do not bump badge', () => {
    for (const payload_type of ['access_request', 'system', 'notification'] as const) {
      expect(
        messageCountsAsUnreadForCurrentUser(
          { is_read: false, sender_id: 2, payload_type },
          7,
        ),
      ).toBe(false);
    }
  });
});
