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

export type StoryRingBarProps = {
  groups: StoryAuthorGroup[];
  onOpenGroup: (group: StoryAuthorGroup) => void;
  onCompose: () => void;
};

export function StoryRingBar({ groups, onOpenGroup, onCompose }: StoryRingBarProps) {
  return (
    <div className={styles.bar} role="list" aria-label="Истории">
      {groups.map((group) => {
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
          <button
            key={group.author.member_id}
            type="button"
            className={styles.item}
            role="listitem"
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
        );
      })}
    </div>
  );
}
