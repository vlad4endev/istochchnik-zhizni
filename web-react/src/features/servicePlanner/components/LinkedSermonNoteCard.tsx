import { Link } from 'react-router-dom';
import { LuBookOpen, LuExternalLink, LuFileText } from 'react-icons/lu';

import type { LinkedSermonNoteSummary } from '../api';
import { sermonNoteSharePath } from '../../mySermons/api';

type Props = {
  note: LinkedSermonNoteSummary;
  /** Текущий пользователь — владелец конспекта (можно открыть редактор). */
  canOpenEditor?: boolean;
  /** Компактный вид в списке блоков. */
  compact?: boolean;
  className?: string;
};

export function LinkedSermonNoteCard({ note, canOpenEditor, compact, className }: Props) {
  const title = note.title.trim() || note.topic.trim() || 'Конспект проповеди';
  const topic = note.topic.trim() && note.topic.trim() !== title ? note.topic.trim() : '';
  const scripture = note.scripture.trim();
  const publicHref =
    note.is_public && note.share_token ? sermonNoteSharePath(note.share_token) : null;
  const editorHref = canOpenEditor ? `/my-sermons/${note.id}` : null;

  return (
    <div
      className={[
        'rounded-xl border border-[#E8D5C8] bg-gradient-to-br from-[#FFF8F3] via-white to-[#F7F1EC]',
        compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        className ?? '',
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={[
            'flex shrink-0 items-center justify-center rounded-lg bg-[#6B2D3E]/10 text-[#6B2D3E]',
            compact ? 'h-7 w-7' : 'h-9 w-9',
          ].join(' ')}
        >
          <LuBookOpen className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8A5A4A]">
            Конспект проповеди
          </p>
          <p className={['font-semibold text-stone-900', compact ? 'text-xs' : 'text-sm'].join(' ')}>
            {title}
          </p>
          {topic || scripture || note.author_name ? (
            <p className={['mt-0.5 text-stone-600', compact ? 'text-[11px]' : 'text-xs'].join(' ')}>
              {[scripture, topic, note.author_name].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-2">
            {editorHref ? (
              <Link
                to={editorHref}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B2D3E] hover:underline"
              >
                <LuFileText className="h-3 w-3" aria-hidden />
                Открыть документ
              </Link>
            ) : null}
            {publicHref ? (
              <Link
                to={publicHref}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-[#6B2D3E] hover:underline"
              >
                <LuExternalLink className="h-3 w-3" aria-hidden />
                Публичная ссылка
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
