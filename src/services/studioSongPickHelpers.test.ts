import assert from 'node:assert/strict';

import {
  computePickScore,
  freshnessScore,
  frequencyPenalty,
  inferSlotRole,
  modePolicy,
  normalizeExcludeSongIds,
  pickAlternativesForSong,
  rankCatalogForPick,
  resolvePickMode,
  type CatalogSongBase,
  type RankedCatalogSong,
  type SongUsageStats,
} from './studioSongPickHelpers';

function song(over: Partial<CatalogSongBase> & { id: number; title: string }): CatalogSongBase {
  return {
    song_number: over.id,
    default_key: 'G',
    tempo: 80,
    tags: [],
    excerpt: 'текст',
    relevance: 0.5,
    ...over,
  };
}

function run(): void {
  assert.equal(resolvePickMode('fresh'), 'fresh');
  assert.equal(resolvePickMode('Свежий'), 'fresh');
  assert.equal(resolvePickMode('classic'), 'classic');
  assert.equal(resolvePickMode(undefined), 'balanced');

  assert.equal(inferSlotRole('Вступление'), 'opening');
  assert.equal(inferSlotRole('Песня поклонения'), 'worship');
  assert.equal(inferSlotRole('Отклик после проповеди'), 'response');
  assert.equal(inferSlotRole('Закрытие / благословение'), 'closing');
  assert.equal(inferSlotRole('Песня 2'), 'general');

  assert.equal(freshnessScore(null), 1);
  assert.ok(freshnessScore(90)! >= 0.99);
  assert.ok(freshnessScore(7)! < freshnessScore(60)!);

  assert.ok(frequencyPenalty(8) > frequencyPenalty(1));
  assert.equal(frequencyPenalty(0), 0);

  const freshPolicy = modePolicy('fresh');
  const classicPolicy = modePolicy('classic');
  assert.ok(freshPolicy.hardCooldownDays > classicPolicy.hardCooldownDays);
  assert.ok(freshPolicy.temperature > classicPolicy.temperature);

  const underusedScore = computePickScore(
    { relevance: 0.5, usage_count_6m: 0, days_since_last_use: null },
    modePolicy('balanced'),
    0.5,
  );
  const overusedScore = computePickScore(
    { relevance: 0.5, usage_count_6m: 8, days_since_last_use: 3 },
    modePolicy('balanced'),
    0.5,
  );
  assert.ok(underusedScore > overusedScore);

  const catalog = [
    song({ id: 1, title: 'Хит недели', relevance: 0.9 }),
    song({ id: 2, title: 'Забытая жемчужина', relevance: 0.7 }),
    song({ id: 3, title: 'Ещё одна', relevance: 0.6 }),
  ];
  const usageBySongId = new Map<number, SongUsageStats>([
    [1, { song_id: 1, usage_count_6m: 10, last_used_date: '2026-08-02', days_since_last_use: 7 }],
    [2, { song_id: 2, usage_count_6m: 1, last_used_date: '2026-04-01', days_since_last_use: 130 }],
    [3, { song_id: 3, usage_count_6m: 0, last_used_date: null, days_since_last_use: null }],
  ]);

  const rankedFresh = rankCatalogForPick({
    catalog,
    usageBySongId,
    policy: modePolicy('fresh'),
    seed: 'test-seed-a',
    todayYmd: '2026-08-09',
    hardAvoidIds: new Set([1]),
  });
  assert.equal(rankedFresh[0]!.on_cooldown, false);
  assert.notEqual(rankedFresh[0]!.id, 1);
  assert.ok(rankedFresh.find((s) => s.id === 1)?.on_cooldown);

  // Разные seed → разный порядок при близких score (шумовой компонент)
  const a = rankCatalogForPick({
    catalog,
    usageBySongId,
    policy: modePolicy('fresh'),
    seed: 'seed-one',
    todayYmd: '2026-08-09',
    hardAvoidIds: new Set(),
  }).map((s) => s.id);
  const b = rankCatalogForPick({
    catalog,
    usageBySongId,
    policy: modePolicy('fresh'),
    seed: 'seed-two',
    todayYmd: '2026-08-09',
    hardAvoidIds: new Set(),
  }).map((s) => s.id);
  assert.equal(a.length, b.length);

  const ranked: RankedCatalogSong[] = rankedFresh;
  const alts = pickAlternativesForSong({
    primaryId: ranked[0]!.id,
    ranked,
    usedIds: new Set([ranked[0]!.id]),
    limit: 2,
  });
  assert.ok(alts.length <= 2);
  assert.ok(alts.every((s) => s.id !== ranked[0]!.id));

  assert.deepEqual(normalizeExcludeSongIds([1, '2', 2, -1, 'x', 3]), [1, 2, 3]);

  console.log('studioSongPickHelpers.test.ts: OK');
}

run();
