import { describe, expect, it } from 'vitest';
import {
  canAddMemberToGroupChat,
  formatMemberSearchStatusLine,
} from '../src/features/messenger/memberPresenceLabel';

describe('memberPresenceLabel', () => {
  it('shows pending registration', () => {
    expect(
      formatMemberSearchStatusLine({
        registration_status: 'pending_review',
        has_registered: false,
      }),
    ).toBe('Ожидает одобрения регистрации');
  });

  it('shows no app login', () => {
    expect(
      formatMemberSearchStatusLine({
        registration_status: 'active',
        has_registered: false,
      }),
    ).toBe('В списке церкви · вход в приложение не оформлен');
  });

  it('shows online when in app and connected', () => {
    expect(
      formatMemberSearchStatusLine({
        registration_status: 'active',
        has_registered: true,
        is_online: true,
      }),
    ).toBe('в сети');
  });

  it('allows add only for active registration', () => {
    expect(canAddMemberToGroupChat({ registration_status: 'active' })).toBe(true);
    expect(canAddMemberToGroupChat({ registration_status: 'pending_review' })).toBe(false);
  });
});
