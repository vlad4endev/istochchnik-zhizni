import { LuPlus, LuUser } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import type { StoryAuthorGroup } from '../feedApi';

import styles from './StoryRingBar.module.css';

function storyLabel(group: StoryAuthorGroup): string {
  if (group.is_me) return 'Ваша история';
  const uname = (group.author.username ?? '').trim();
  if (uname && !/^member-\d+$/i.test(uname)) {
    return uname.length > 11 ? `${uname.slice(0, 10)}…` : uname;
  }
  const full =
    memberNameFirstLast(group.author) ||
    group.author.display_name?.trim() ||
    'Участник';
  const first = full.split(/\s+/)[0] ?? full;
  return first.length > 11 ? `${first.slice(0, 10)}…` : first;
}

/** One ring per author — dedupe by member_id and keep «me» first. */
export function normalizeStoryRingGroups(groups: StoryAuthorGroup[]): StoryAuthorGroup[] {
  const byId = new Map<number, StoryAuthorGroup>();
  for (const g of groups) {
    const id = Number(g.author?.member_id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, {
        ...g,
        author: { ...g.author, member_id: id },
        stories: Array.isArray(g.stories) ? g.stories : [],
        is_me: Boolean(g.is_me),
      });
      continue;
    }
    // Prefer the entry that has stories / is_me flag.
    const mergedStories =
      (g.stories?.length ?? 0) >= (prev.stories?.length ?? 0) ? (g.stories ?? []) : prev.stories;
    const isMe = Boolean(prev.is_me || g.is_me);
    const allSeen = isMe
      ? true
      : mergedStories.length > 0
        ? mergedStories.every((s) => s.viewed_by_me)
        : Boolean(g.all_seen && prev.all_seen);
    byId.set(id, {
      ...prev,
      ...g,
      author: { ...prev.author, ...g.author, member_id: id },
      stories: mergedStories,
      is_me: isMe,
      all_seen: allSeen,
    });
  }
  const list = [...byId.values()];
  list.sort((a, b) => {
    if (a.is_me !== b.is_me) return a.is_me ? -1 : 1;
    if (a.all_seen !== b.all_seen) return a.all_seen ? 1 : -1;
    return 0;
  });
  return list;
}

export type StoryRingBarProps = {
  groups: StoryAuthorGroup[];
  onOpenGroup: (group: StoryAuthorGroup) => void;
  onCompose: () => void;
};

export function StoryRingBar({ groups, onOpenGroup, onCompose }: StoryRingBarProps) {
  const rings = normalizeStoryRingGroups(groups);

  return (
    <div className={styles.bar} role="list" aria-label="Истории">
      {rings.map((group) => {
        const memberId = Number(group.author.member_id);
        const av = resolvePublicUrl(group.author.avatar_url);
        const hasStories = group.stories.length > 0;
        const ringClass = [
          styles.ring,
          !hasStories ? styles.ringEmpty : '',
          hasStories && group.all_seen && !group.is_me ? styles.ringSeen : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div key={`story-ring-${memberId}`} className={styles.item} role="listitem">
            <button
              type="button"
              className={styles.itemBtn}
              aria-label={storyLabel(group)}
              onClick={() => {
                if (group.is_me && !hasStories) {
                  onCompose();
                  return;
                }
                if (hasStories) onOpenGroup(group);
                else if (group.is_me) onCompose();
              }}
            >
              <span className={ringClass}>
                <span className={styles.avatarWrap}>
                  {av ? (
                    <img className={styles.avatarMedia} src={av} alt="" />
                  ) : (
                    <LuUser className="h-6 w-6 opacity-40" aria-hidden />
                  )}
                </span>
                {group.is_me ? (
                  <span className={styles.addBadge} aria-hidden>
                    <LuPlus className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
              <span className={`${styles.label} ${group.is_me ? styles.labelMe : ''}`}>
                {storyLabel(group)}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
