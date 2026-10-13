import { LuMic, LuVideo } from 'react-icons/lu';

type MeetingAvatarProps = {
  mediaType?: 'audio' | 'video';
  /** Larger mark for the in-call stage */
  size?: 'md' | 'lg';
  className?: string;
};

/**
 * Thematic mark for meetings (Источник жизни): brand gradient + soft rings.
 * Replaces the empty dark circle placeholder in call UI.
 */
export function MeetingAvatar({ mediaType = 'video', size = 'lg', className }: MeetingAvatarProps) {
  const isVideo = mediaType !== 'audio';
  const Icon = isVideo ? LuVideo : LuMic;
  const iconSize = size === 'lg' ? 40 : 30;

  return (
    <div
      className={['meeting-avatar', size === 'lg' ? 'meeting-avatar--lg' : 'meeting-avatar--md', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <span className="meeting-avatar__ring" />
      <span className="meeting-avatar__ring meeting-avatar__ring--late" />
      <span className="meeting-avatar__badge">
        <Icon size={iconSize} strokeWidth={1.7} />
      </span>
    </div>
  );
}
