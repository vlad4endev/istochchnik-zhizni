import { describe, expect, it } from 'vitest';

import { normalizeStoryRingGroups } from '../src/features/feed/components/StoryRingBar';
import type { StoryAuthorGroup } from '../src/features/feed/feedApi';

function group(
  memberId: number | string,
  opts?: Partial<StoryAuthorGroup> & { storiesCount?: number },
): StoryAuthorGroup {
  const id = Number(memberId);
  const n = opts?.storiesCount ?? 1;
  return {
    author: {
      member_id: id as number,
      username: `user-${id}`,
      first_name: 'A',
      last_name: 'B',
      display_name: `User ${id}`,
      avatar_url: null,
    },
    stories: Array.from({ length: n }, (_, i) => ({
      id: `${id}-${i}`,
      member_id: id,
      media_url: `/s/${id}-${i}.jpg`,
      media_type: 'image' as const,
      caption: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      viewed_by_me: false,
    })),
    all_seen: false,
    is_me: false,
    ...opts,
  };
}

describe('normalizeStoryRingGroups', () => {
  it('keeps one ring per author in a horizontal list order', () => {
    const rings = normalizeStoryRingGroups([
      group(1, { is_me: true, storiesCount: 0, all_seen: true, stories: [] }),
      group(2),
      group(3),
    ]);
    expect(rings.map((g) => g.author.member_id)).toEqual([1, 2, 3]);
    expect(rings[0]?.is_me).toBe(true);
  });

  it('dedupes duplicate member ids instead of stacking rings', () => {
    const rings = normalizeStoryRingGroups([
      group(1, { is_me: true, storiesCount: 0, all_seen: true, stories: [] }),
      group('2' as unknown as number),
      group(2, { storiesCount: 2 }),
      group(1, { is_me: true, storiesCount: 1 }),
    ]);
    expect(rings).toHaveLength(2);
    expect(rings.map((g) => g.author.member_id)).toEqual([1, 2]);
    expect(rings[0]?.stories).toHaveLength(1);
    expect(rings[1]?.stories).toHaveLength(2);
  });

  it('puts unseen authors before fully seen ones after me', () => {
    const rings = normalizeStoryRingGroups([
      group(2, { all_seen: true }),
      group(1, { is_me: true, storiesCount: 0, all_seen: true, stories: [] }),
      group(3, { all_seen: false }),
    ]);
    expect(rings.map((g) => g.author.member_id)).toEqual([1, 3, 2]);
  });
});
