import { LuPlus, LuUser } from 'react-icons/lu';

import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { memberNameFirstLast } from '../../profile/memberDisplayName';
import type { StoryAuthorGroup } from '../feedApi';

import styles from './StoryRingBar.module.css';

function shortName(group: StoryAuthorGroup): string {
  if (group.is_me) return 'Вы';
  const full =
    memberNameFirstLast(group.author) ||
    group.author.display_name?.trim() ||
    group.author.username;
  const first = full.split(/\s+/)[0] ?? full;
  return first.length > 10 ? `${first.slice(0, 9)}…` : first;
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
                {av ? <img src={av} alt="" /> : <LuUser className="h-6 w-6 opacity-40" aria-hidden />}
                {group.is_me ? (
                  <span className={styles.addBadge} aria-hidden>
                    <LuPlus className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
              </span>
            </span>
            <span className={styles.label}>{shortName(group)}</span>
          </button>
        );
      })}
    </div>
  );
}
