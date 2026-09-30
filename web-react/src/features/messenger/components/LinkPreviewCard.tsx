import { useEffect, useState } from 'react';
import { LuExternalLink } from 'react-icons/lu';

import { fetchLinkPreview, type LinkPreviewData } from '../api/messengerApi';
import { appPathFromAbsoluteUrl } from '../messengerPlainText';

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const MAX_CARDS = 2;

/** Первые внешние ссылки из текста (без завершающей пунктуации, без дублей). */
export function extractPreviewUrls(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const url = raw.replace(/[.,;:!?)»]+$/, '');
    if (appPathFromAbsoluteUrl(url)) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

function LinkPreviewCard({ url, isMine }: { url: string; isMine: boolean }) {
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [imgOk, setImgOk] = useState(true);
  const [iconOk, setIconOk] = useState(true);

  useEffect(() => {
    let alive = true;
    void fetchLinkPreview(url).then((p) => {
      if (alive) setData(p);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!data) return null;
  const showImage = Boolean(data.image) && imgOk;
  const site = data.siteName || data.host;

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={[
        'group block overflow-hidden rounded-xl border no-underline transition-colors',
        isMine
          ? 'border-white/20 bg-white/10 text-white hover:bg-white/15'
          : 'border-black/10 bg-black/[0.03] text-inherit hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10',
      ].join(' ')}
    >
      {showImage ? (
        <img
          src={data.image!}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgOk(false)}
          className="h-36 w-full object-cover"
        />
      ) : null}
      <div className="space-y-0.5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
          {data.favicon && iconOk ? (
            <img
              src={data.favicon}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setIconOk(false)}
              className="h-3.5 w-3.5 rounded-sm"
            />
          ) : (
            <LuExternalLink className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="truncate">{site}</span>
        </div>
        {data.title ? <div className="line-clamp-2 text-sm font-bold leading-snug">{data.title}</div> : null}
        {data.description ? (
          <div className="line-clamp-3 text-xs leading-snug opacity-75">{data.description}</div>
        ) : null}
      </div>
    </a>
  );
}

export function LinkPreviews({ text, isMine }: { text: string; isMine: boolean }) {
  const urls = extractPreviewUrls(text);
  if (!urls.length) return null;
  return (
    <div className="mt-2 max-w-full space-y-2">
      {urls.map((u) => (
        <LinkPreviewCard key={u} url={u} isMine={isMine} />
      ))}
    </div>
  );
}
