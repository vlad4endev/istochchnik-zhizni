import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/messengerApi';
import {
  getAlbumImageUrl,
  getPrimaryAttachmentUrl,
  inferMessengerPayloadType,
  isMessengerVideoAttachment,
} from '../payloadMedia';
import { resolvePublicUrl } from '../../../lib/resolvePublicUrl';

export type SharedMediaItem = { id: string; src: string };
export type SharedFileItem = { id: string; href: string; name: string };
export type SharedLinkItem = { id: string; url: string };

/** Максимум страниц по 50 сообщений, которые подгружаем для «общих медиа» (~400 сообщений). */
const MAX_PAGES = 8;
const PAGE_SIZE = 50;

/**
 * История медиа, файлов и ссылок диалога — из последних сообщений. Общий источник для страницы
 * «Медиа, файлы и ссылки» и блока «Общие медиа» в профиле собеседника.
 */
export function useConversationSharedMedia(chatId: string | undefined) {
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
        for (let i = 0; i < MAX_PAGES; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const page = await api.fetchMessages(chatId, before, PAGE_SIZE);
          if (!alive) return;
          if (!page.length) break;
          acc.push(...page);
          if (page.length < PAGE_SIZE) break;
          before = String(page[0]?.id ?? '');
          if (!before) break;
        }
        if (!alive) return;
        setMessages(acc);
      } catch {
        if (!alive) return;
        setErr('Не удалось загрузить медиа');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chatId]);

  /** Свежие сверху: страницы приходят от новых к старым, а внутри страницы — по возрастанию. */
  const ordered = useMemo(() => {
    const num = (m: api.MessageWithSender) => {
      const n = Number(m.id);
      return Number.isFinite(n) ? n : 0;
    };
    return [...messages].sort((a, b) => num(b) - num(a));
  }, [messages]);

  const mediaItems = useMemo(() => {
    const out: SharedMediaItem[] = [];
    for (const m of ordered) {
      if (m.is_deleted || inferMessengerPayloadType(m) !== 'image') continue;
      const p = (m.payload ?? {}) as Record<string, unknown>;
      const album = Array.isArray(p.images) ? p.images : [];
      if (album.length) {
        for (const [idx, img] of album.entries()) {
          const row = typeof img === 'object' && img !== null ? (img as Record<string, unknown>) : {};
          const raw = getAlbumImageUrl(row);
          if (isMessengerVideoAttachment(row, raw)) continue;
          const id = String(m.id);
          // Вложения мессенджера отдаются через прокси с авторизацией: прямая ссылка из payload часто не открывается.
          const src = /^\d+$/.test(id)
            ? api.buildMessengerAttachmentFileUrl(id, { slot: idx })
            : (resolvePublicUrl(raw) ?? raw);
          if (src) out.push({ id, src });
        }
      } else {
        const raw = getPrimaryAttachmentUrl(p);
        if (isMessengerVideoAttachment(p as Record<string, unknown>, raw)) continue;
        const id = String(m.id);
        const src = /^\d+$/.test(id) ? api.buildMessengerAttachmentFileUrl(id) : (resolvePublicUrl(raw) ?? raw);
        if (src) out.push({ id, src });
      }
    }
    return out;
  }, [ordered]);

  const fileItems = useMemo(() => {
    const out: SharedFileItem[] = [];
    for (const m of ordered) {
      if (m.is_deleted || inferMessengerPayloadType(m) !== 'file') continue;
      const p = (m.payload ?? {}) as { url?: string; name?: string; filename?: string };
      const raw = getPrimaryAttachmentUrl(p as Record<string, unknown>);
      const id = String(m.id);
      const href = /^\d+$/.test(id) ? api.buildMessengerAttachmentFileUrl(id) : resolvePublicUrl(raw) ?? raw;
      if (!href) continue;
      out.push({ id, href, name: String(p.name ?? p.filename ?? 'Файл').trim() || 'Файл' });
    }
    return out;
  }, [ordered]);

  const linkItems = useMemo(() => {
    const rx = /(https?:\/\/[^\s]+)/gi;
    const out: SharedLinkItem[] = [];
    for (const m of ordered) {
      if (m.is_deleted) continue;
      const text = String(m.content ?? '');
      const matches = text.match(rx) ?? [];
      for (const url of matches) out.push({ id: String(m.id), url });
    }
    return out;
  }, [ordered]);

  return { loading, err, mediaItems, fileItems, linkItems };
}
