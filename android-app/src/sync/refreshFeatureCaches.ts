import {fetchChurchFeed} from '../shared/feed/feedApi';
import {
  defaultMediaScheduleRange,
  fetchMyMediaSchedule,
} from '../shared/mediaSchedule/mediaScheduleApi';
import {feedCacheRepository} from '../repositories/FeedCacheRepository';
import {mediaEventCacheRepository} from '../repositories/MediaEventCacheRepository';

/**
 * Pulls new web features into local SQLite caches for offline reading.
 * Failures are non-fatal for the core song/member sync.
 */
export async function refreshFeatureCaches(): Promise<void> {
  const errors: string[] = [];

  try {
    const page = await fetchChurchFeed({limit: 30});
    await feedCacheRepository.replaceCache(page.posts ?? []);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'feed cache failed');
  }

  try {
    const {from, to} = defaultMediaScheduleRange();
    const events = await fetchMyMediaSchedule(from, to);
    await mediaEventCacheRepository.replaceCache(events);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'media schedule cache failed');
  }

  if (errors.length === 2) {
    throw new Error(errors.join('; '));
  }
}
