import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight, LuFile, LuFileArchive, LuFileSpreadsheet, LuFileText, LuImage, LuLink2 } from 'react-icons/lu';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { useConversationSharedMedia } from './useConversationSharedMedia';
import './privateChatProfile.css';

type MediaTab = 'media' | 'files' | 'links';

const MEDIA_PREVIEW = 18;
const FILES_PREVIEW = 6;
const LINKS_PREVIEW = 6;

function fileIcon(name: string): ReactNode {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return <LuFileSpreadsheet size={20} aria-hidden />;
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return <LuFileArchive size={20} aria-hidden />;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return <LuFileText size={20} aria-hidden />;
  return <LuFile size={20} aria-hidden />;
}

function fileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? (parts.pop() ?? '').slice(0, 5).toUpperCase() : 'ФАЙЛ';
}

function linkHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}


/** Карточка «Медиа / Файлы / Ссылки» чата — общая для профиля собеседника и группы. */
export function SharedMediaCard({ chatId }: { chatId: string }) {
  const [tab, setTab] = useState<MediaTab>('media');
  const { loading, err, mediaItems, fileItems, linkItems } = useConversationSharedMedia(chatId);

  return (
    <section className="pcp-card pcp-media" aria-label="Общие медиа, файлы и ссылки">
    <div className="pcp-tabs" role="tablist" aria-label="История вложений">
      <TabBtn active={tab === 'media'} onClick={() => setTab('media')} label="Медиа" count={mediaItems.length} loading={loading} />
      <TabBtn active={tab === 'files'} onClick={() => setTab('files')} label="Файлы" count={fileItems.length} loading={loading} />
      <TabBtn active={tab === 'links'} onClick={() => setTab('links')} label="Ссылки" count={linkItems.length} loading={loading} />
    </div>

    {loading ? (
      <div className="pcp-media__skeleton">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBox key={i} width="100%" height="100%" radius="0" className="pcp-media__skeleton-cell" />
        ))}
      </div>
    ) : null}
    {err ? <p className="pcp-empty pcp-empty--error">{err}</p> : null}

    {!loading && !err && tab === 'media' ? (
      mediaItems.length ? (
        <div className="pcp-grid" role="tabpanel">
          {mediaItems.slice(0, MEDIA_PREVIEW).map((item, i) => (
            <a key={`${item.id}-${i}`} href={item.src} target="_blank" rel="noreferrer" className="pcp-grid__cell">
              <img src={item.src} alt="" loading="lazy" decoding="async" />
            </a>
          ))}
        </div>
      ) : (
        <EmptyState icon={<LuImage size={28} aria-hidden />} text="Фото, которыми вы обменялись, появятся здесь" />
      )
    ) : null}

    {!loading && !err && tab === 'files' ? (
      fileItems.length ? (
        <ul className="pcp-list" role="tabpanel">
          {fileItems.slice(0, FILES_PREVIEW).map((item, i) => (
            <li key={`${item.id}-${i}`}>
              <a href={item.href} target="_blank" rel="noreferrer" className="pcp-file">
                <span className="pcp-file__icon">{fileIcon(item.name)}</span>
                <span className="pcp-file__name">{item.name}</span>
                <span className="pcp-file__ext">{fileExt(item.name)}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<LuFile size={28} aria-hidden />} text="Файлы и документы появятся здесь" />
      )
    ) : null}

    {!loading && !err && tab === 'links' ? (
      linkItems.length ? (
        <ul className="pcp-list" role="tabpanel">
          {linkItems.slice(0, LINKS_PREVIEW).map((item, i) => (
            <li key={`${item.id}-${i}`}>
              <a href={item.url} target="_blank" rel="noreferrer" className="pcp-file">
                <span className="pcp-file__icon pcp-file__icon--link"><LuLink2 size={20} aria-hidden /></span>
                <span className="pcp-file__text">
                  <span className="pcp-file__name">{linkHost(item.url)}</span>
                  <span className="pcp-file__sub">{item.url}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<LuLink2 size={28} aria-hidden />} text="Ссылки из переписки появятся здесь" />
      )
    ) : null}

    {!loading && !err && (mediaItems.length > MEDIA_PREVIEW || fileItems.length > FILES_PREVIEW || linkItems.length > LINKS_PREVIEW) ? (
      <Link to={`/messenger/chat/${chatId}/manage/media`} className="pcp-more">
        <span>Показать всё</span>
        <LuChevronRight size={18} aria-hidden />
      </Link>
    ) : null}
  </section>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
  loading,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  loading: boolean;
}) {
  return (
    <button type="button" role="tab" aria-selected={active} className={['pcp-tab', active ? 'pcp-tab--active' : ''].join(' ')} onClick={onClick}>
      <span>{label}</span>
      {!loading ? <span className="pcp-tab__count">{count}</span> : null}
    </button>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="pcp-empty-state">
      <span className="pcp-empty-state__icon">{icon}</span>
      <p>{text}</p>
    </div>
  );
}
