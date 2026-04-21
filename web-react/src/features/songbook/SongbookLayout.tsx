import { Outlet } from 'react-router-dom';

import { SongbookChromeProvider, useSongbookChrome } from './SongbookChromeContext';

function SongbookShell() {
  const { stageMode, toggleStageMode } = useSongbookChrome();

  return (
    <div
      data-songbook-module
      className={[
        'flex min-h-0 min-w-0 flex-1 flex-col',
        stageMode ? 'songbook-stage bg-[#030303] text-zinc-100' : 'bg-[var(--surface)] text-[var(--text)]',
      ].join(' ')}
    >
      <div
        className={[
          'sticky top-0 z-20 border-b backdrop-blur-md',
          stageMode ? 'border-zinc-800 bg-[#030303]/90' : 'border-stone-200/80 bg-[var(--surface)]/95',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-3 py-2 md:px-4">
          <p className={`text-xs font-semibold uppercase tracking-wide ${stageMode ? 'text-zinc-500' : 'text-stone-500'}`}>
            Песенник
          </p>
          <button
            type="button"
            onClick={toggleStageMode}
            className={[
              'inline-flex min-h-[36px] items-center rounded-full border px-3 text-xs font-semibold transition-colors',
              stageMode
                ? 'border-zinc-600 text-zinc-200 hover:bg-zinc-900'
                : 'border-stone-200 text-stone-700 hover:bg-stone-50',
            ].join(' ')}
          >
            {stageMode ? 'Светлая тема' : 'Режим сцены'}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-4 md:px-6">
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
