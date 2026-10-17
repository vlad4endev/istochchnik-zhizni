import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { LuFile, LuImage, LuLink2 } from 'react-icons/lu';
import { useConversationSharedMedia } from './useConversationSharedMedia';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

type MediaTab = 'media' | 'files' | 'links';

export function ChatMediaPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const [tab, setTab] = useState<MediaTab>('media');
  const { loading, err, mediaItems, fileItems, linkItems } = useConversationSharedMedia(chatId);

  return (
    <ManageScreenShell>
      <ManageSettingsGroup className="mt-4">
        <div className="flex items-center gap-1 p-1.5">
          <TabButton active={tab === 'media'} onClick={() => setTab('media')} icon={<LuImage size={16} />} label={`Фото/Видео (${mediaItems.length})`} />
          <TabButton active={tab === 'files'} onClick={() => setTab('files')} icon={<LuFile size={16} />} label={`Файлы (${fileItems.length})`} />
          <TabButton active={tab === 'links'} onClick={() => setTab('links')} icon={<LuLink2 size={16} />} label={`Ссылки (${linkItems.length})`} />
        </div>
      </ManageSettingsGroup>

      <ManageSettingsGroup className="mt-3 p-3">
        {loading ? (
          <div className="space-y-2">
            <SkeletonBox width="42%" height="13px" />
            <SkeletonBox width="100%" height="54px" radius="10px" />
            <SkeletonBox width="100%" height="54px" radius="10px" />
          </div>
        ) : null}
        {err ? <p className="text-sm font-medium text-red-600">{err}</p> : null}
        {!loading && !err && tab === 'media' ? (
          mediaItems.length ? (
            <div className="grid grid-cols-3 gap-2">
              {mediaItems.map((item) => (
                <a key={`${item.id}-${item.src}`} href={item.src} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-stone-100">
                  <img src={item.src} alt="" className="h-24 w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Нет медиа</p>
          )
        ) : null}
        {!loading && !err && tab === 'files' ? (
          fileItems.length ? (
            <div className="space-y-2">
              {fileItems.map((item) => (
                <a key={`${item.id}-${item.href}`} href={item.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-gray-800 ring-1 ring-stone-200">
                  <LuFile size={16} className="shrink-0 text-gray-500" />
                  <span className="truncate">{item.name}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Нет файлов</p>
          )
        ) : null}
        {!loading && !err && tab === 'links' ? (
          linkItems.length ? (
            <div className="space-y-2">
              {linkItems.map((item, idx) => (
                <a key={`${item.id}-${idx}`} href={item.url} target="_blank" rel="noreferrer" className="block truncate rounded-lg bg-stone-50 px-3 py-2 text-sm text-blue-600 ring-1 ring-stone-200">
                  {item.url}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Нет ссылок</p>
          )
        ) : null}
      </ManageSettingsGroup>
    </ManageScreenShell>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl px-2 text-xs font-semibold',
        active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700',
      ].join(' ')}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
