import { Outlet } from 'react-router-dom';

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
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 pt-1">
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
