import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LuFile, LuImage, LuLink2 } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import {
  getAlbumImageUrl,
  getPrimaryAttachmentUrl,
  inferMessengerPayloadType,
  isMessengerVideoAttachment,
} from '../payloadMedia';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

type MediaTab = 'media' | 'files' | 'links';

export function ChatMediaPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const [tab, setTab] = useState<MediaTab>('media');
  const [messages, setMessages] = useState<api.MessageWithSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const acc: api.MessageWithSender[] = [];
        let before: string | undefined = undefined;
        for (let i = 0; i < 8; i += 1) {
          // максимум ~400 сообщений для экрана медиа
          // eslint-disable-next-line no-await-in-loop
          const page = await api.fetchMessages(chatId, before, 50);
          if (!alive) return;
          if (!page.length) break;
          acc.push(...page);
          if (page.length < 50) break;
          before = String(page[0]?.id ?? '');
          if (!before) break;
        }
        if (!alive) return;
        setMessages(acc);
      } catch {
        if (!alive) return;
        setErr('Не удалось загрузить медиа');
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chatId]);

  const mediaItems = useMemo(() => {
    const out: Array<{ id: string; src: string }> = [];
    for (const m of messages) {
      if (m.is_deleted || inferMessengerPayloadType(m) !== 'image') continue;
      const p = (m.payload ?? {}) as Record<string, unknown>;
      const album = Array.isArray(p.images) ? p.images : [];
      if (album.length) {
        for (const img of album) {
          const row = typeof img === 'object' && img !== null ? (img as Record<string, unknown>) : {};
          const raw = getAlbumImageUrl(row);
          if (isMessengerVideoAttachment(row, raw)) continue;
          const src = resolvePublicUrl(raw) ?? raw;
          if (src) out.push({ id: String(m.id), src });
        }
      } else {
        const raw = getPrimaryAttachmentUrl(p);
        if (isMessengerVideoAttachment(p as Record<string, unknown>, raw)) continue;
        const src = resolvePublicUrl(raw) ?? raw;
        if (src) out.push({ id: String(m.id), src });
      }
    }
    return out;
  }, [messages]);

  const fileItems = useMemo(() => {
    return messages
      .filter((m) => !m.is_deleted && inferMessengerPayloadType(m) === 'file')
      .map((m) => {
        const p = (m.payload ?? {}) as { url?: string; name?: string; filename?: string };
        const raw = getPrimaryAttachmentUrl(p as Record<string, unknown>);
        const id = String(m.id);
        const href = /^\d+$/.test(id)
          ? api.buildMessengerAttachmentFileUrl(id)
          : resolvePublicUrl(raw) ?? raw;
        return {
          id,
          href,
          name: String(p.name ?? p.filename ?? 'Файл').trim() || 'Файл',
        };
      })
      .filter((x) => Boolean(x.href));
  }, [messages]);

  const linkItems = useMemo(() => {
    const rx = /(https?:\/\/[^\s]+)/gi;
    const out: Array<{ id: string; url: string }> = [];
    for (const m of messages) {
      const text = String(m.content ?? '');
      const matches = text.match(rx) ?? [];
      for (const url of matches) out.push({ id: String(m.id), url });
    }
    return out;
  }, [messages]);

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
