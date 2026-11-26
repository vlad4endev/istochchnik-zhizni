import { describe, expect, it } from 'vitest';

import { formatInviteChatMessage } from './shareInviteToChats';

describe('formatInviteChatMessage', () => {
  it('собирает приглашение с названием и ссылкой', () => {
    expect(formatInviteChatMessage('Молодёжка', 'https://x.test/call/join/abc')).toBe(
      'Приглашаю на видеовстречу «Молодёжка»\nhttps://x.test/call/join/abc',
    );
  });

  it('учитывает аудио и пустое название', () => {
    expect(formatInviteChatMessage('  ', ' https://x.test/j ', 'audio')).toBe(
      'Приглашаю на аудиовстречу\nhttps://x.test/j',
    );
  });
});
