import { Link, Outlet } from 'react-router-dom';

import { SongbookChromeProvider, useSongbookChrome } from './SongbookChromeContext';

function SongbookShell() {
  const { stageMode } = useSongbookChrome();

  return (
    <div
      data-songbook-module
      className={[
        'flex h-full min-h-0 min-w-0 flex-1 flex-col',
        stageMode ? 'songbook-stage bg-[#030303] text-zinc-100' : 'bg-[var(--surface)] text-[var(--text)]',
      ].join(' ')}
    >
      <div
        className={[
          'flex-shrink-0 border-b backdrop-blur-md',
          stageMode ? 'border-zinc-800 bg-[#030303]/90' : 'border-stone-200/80 bg-[var(--surface)]/95',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-3 py-1.5 md:px-4">
          <Link
            to="/songbook"
            className={[
              'min-w-0 shrink text-sm font-semibold tracking-tight transition-colors',
              stageMode ? 'text-zinc-300 hover:text-white' : 'text-stone-700 hover:text-stone-900',
            ].join(' ')}
          >
            Песни
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-2 pt-1 md:px-4 md:pt-1.5">
        <Outlet />
      </div>
    </div>
  );
}

/** Вложенный layout модуля «Песни» внутри основного App Layout. */
export function SongbookLayout() {
  return (
    <SongbookChromeProvider>
      <SongbookShell />
    </SongbookChromeProvider>
  );
}
