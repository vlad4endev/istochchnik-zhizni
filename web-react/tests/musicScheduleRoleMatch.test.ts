import { describe, expect, it } from 'vitest';

import {
  isMusicLeader,
  musicRoleMemberMatchTokens,
} from '../src/features/musicSchedule/ministryRoleMatch';

describe('isMusicLeader', () => {
  it('recognizes Лидер Прославления', () => {
    expect(isMusicLeader('Лидер Прославления')).toBe(true);
  });

  it('recognizes Музыкальный лидер', () => {
    expect(isMusicLeader('Музыкальный лидер')).toBe(true);
  });

  it('recognizes Лидер поклонения', () => {
    expect(isMusicLeader('Лидер поклонения')).toBe(true);
  });

  it('rejects unrelated ministry roles', () => {
    expect(isMusicLeader('Гитара')).toBe(false);
    expect(isMusicLeader('Медиа менеджер')).toBe(false);
  });
});

describe('musicRoleMemberMatchTokens', () => {
  it('includes worship leader aliases for Лидер поклонения slot', () => {
    const tokens = musicRoleMemberMatchTokens({ name: 'Лидер поклонения' });
    expect(tokens).toContain('Лидер поклонения');
    expect(tokens).toContain('Лидер Прославления');
    expect(tokens).toContain('Музыкальный лидер');
  });

  it('returns single token for instrument roles', () => {
    expect(musicRoleMemberMatchTokens({ name: 'Гитара' })).toEqual(['Гитара']);
  });

  it('uses ministry_role_filter when set', () => {
    const tokens = musicRoleMemberMatchTokens({
      name: 'Лидер поклонения',
      ministry_role_filter: 'Лидер Прославления',
    });
    expect(tokens).toContain('Лидер Прославления');
    expect(tokens).toContain('Музыкальный лидер');
  });
});
