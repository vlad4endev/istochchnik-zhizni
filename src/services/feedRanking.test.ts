import assert from 'node:assert/strict';

import {
  diversifyByAuthor,
  hashStringToSeed,
  mulberry32,
  rankFeedPosts,
  rankStoryGroups,
  scoreFeedPost,
  scoreStoryGroup,
  type RankableFeedPost,
} from './feedRanking';

function basePost(over: Partial<RankableFeedPost> = {}): RankableFeedPost {
  return {
    id: '1',
    member_id: 10,
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    like_count: 0,
    comment_count: 0,
    repost_count: 0,
    media_count: 1,
    has_video: false,
    caption_len: 40,
    is_repost: false,
    is_own: false,
    is_admin: false,
    author_likes_from_me: 0,
    author_comments_from_me: 0,
    likes_6h: 0,
    comments_6h: 0,
    author_post_count_7d: 1,
    ...over,
  };
}

function run(): void {
  const now = Date.now();
  const rng = () => 0.5;

  const discussed = scoreFeedPost(
    basePost({ id: 'a', like_count: 2, comment_count: 5, repost_count: 1 }),
    now,
    rng,
  );
  const onlyLikes = scoreFeedPost(basePost({ id: 'b', like_count: 12 }), now, rng);
  assert.ok(discussed > onlyLikes, 'comments/reposts should beat bare likes');

  const fresh = scoreFeedPost(
    basePost({ id: 'c', created_at: new Date(now - 20 * 60_000).toISOString(), like_count: 0 }),
    now,
    rng,
  );
  const oldQuiet = scoreFeedPost(
    basePost({
      id: 'd',
      created_at: new Date(now - 10 * 24 * 3600_000).toISOString(),
      like_count: 1,
    }),
    now,
    rng,
  );
  assert.ok(fresh > oldQuiet, 'fresh posts should surface over stale quiet ones');

  const affinity = scoreFeedPost(
    basePost({ id: 'e', author_likes_from_me: 8, author_comments_from_me: 3 }),
    now,
    rng,
  );
  const stranger = scoreFeedPost(basePost({ id: 'f' }), now, rng);
  assert.ok(affinity > stranger, 'personal affinity should boost authors');

  const ranked = rankFeedPosts(
    [
      basePost({ id: '10', member_id: 1, like_count: 50, comment_count: 20 }),
      basePost({ id: '11', member_id: 1, like_count: 48, comment_count: 18 }),
      basePost({ id: '12', member_id: 2, like_count: 30, comment_count: 10 }),
      basePost({ id: '13', member_id: 3, like_count: 28, comment_count: 9 }),
    ],
    { seedHex: 'abcd1234', nowMs: now },
  );
  assert.equal(ranked.length, 4);
  // После diversity автор 1 не должен занять первые два слота подряд, если есть альтернативы.
  const firstTwoSameAuthor =
    ranked[0]!.member_id === ranked[1]!.member_id && ranked[0]!.member_id === 1;
  assert.equal(firstTwoSameAuthor, false, 'diversity should break author streak at top');

  const diversified = diversifyByAuthor([
    { member_id: 1, rank_score: 100 },
    { member_id: 1, rank_score: 99 },
    { member_id: 2, rank_score: 80 },
  ]);
  assert.equal(diversified[0]!.member_id, 1);
  assert.equal(diversified[1]!.member_id, 2);

  const storyScoreUnseen = scoreStoryGroup(
    {
      member_id: 5,
      is_me: false,
      all_seen: false,
      unseen_count: 3,
      story_count: 3,
      newest_created_at: new Date(now - 3600_000).toISOString(),
      author_likes_from_me: 2,
      author_comments_from_me: 1,
      has_avatar: true,
    },
    now,
  );
  const storyScoreSeen = scoreStoryGroup(
    {
      member_id: 6,
      is_me: false,
      all_seen: true,
      unseen_count: 0,
      story_count: 2,
      newest_created_at: new Date(now - 3600_000).toISOString(),
      author_likes_from_me: 10,
      author_comments_from_me: 5,
      has_avatar: true,
    },
    now,
  );
  assert.ok(storyScoreUnseen > storyScoreSeen, 'unseen stories outrank seen even with less affinity');

  const storyRanked = rankStoryGroups([
    {
      member_id: 1,
      is_me: true,
      all_seen: true,
      unseen_count: 0,
      story_count: 0,
      newest_created_at: new Date(0).toISOString(),
      author_likes_from_me: 0,
      author_comments_from_me: 0,
      has_avatar: true,
    },
    {
      member_id: 2,
      is_me: false,
      all_seen: true,
      unseen_count: 0,
      story_count: 1,
      newest_created_at: new Date(now).toISOString(),
      author_likes_from_me: 0,
      author_comments_from_me: 0,
      has_avatar: false,
    },
    {
      member_id: 3,
      is_me: false,
      all_seen: false,
      unseen_count: 2,
      story_count: 2,
      newest_created_at: new Date(now).toISOString(),
      author_likes_from_me: 0,
      author_comments_from_me: 0,
      has_avatar: true,
    },
  ]);
  assert.equal(storyRanked[0]!.is_me, true);
  assert.equal(storyRanked[1]!.member_id, 3);

  const a = mulberry32(hashStringToSeed('x'));
  const b = mulberry32(hashStringToSeed('x'));
  assert.equal(a(), b());

  console.log('feedRanking.test.ts: OK');
}

run();
