import { useEffect, useRef } from 'react';

import { transposeChordSymbol } from '../chordUtils';
import { type SongListItem } from '../api';
import { LyricsWithChords } from './LyricsWithChords';
import { SongReaderSettings } from './SongReaderSettings';

type ReaderSettings = {
  fontSize: number;
  showChords: boolean;
  transpose: number;
  scrollSpeed: number;
};

type SongReaderProps = {
  song: SongListItem;
  settings: ReaderSettings;
  onSettingsChange: (patch: Partial<ReaderSettings>) => void;
};

export function SongReader({ song, settings, onSettingsChange }: SongReaderProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settings.scrollSpeed <= 0) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (bodyRef.current) bodyRef.current.scrollTop += settings.scrollSpeed * dt;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settings.scrollSpeed, song.id]);

  const keyLabel = song.default_key
    ? transposeChordSymbol(song.default_key, settings.transpose)
    : settings.transpose === 0
      ? 'без сдвига'
      : `сдвиг ${settings.transpose > 0 ? '+' : ''}${settings.transpose}`;

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3 md:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-stone-500">
            Тональность: {song.default_key ?? '—'} · BPM: {song.tempo ?? '—'} · Размер:{' '}
            {song.time_signature ?? '—'}
          </p>
        </div>
        <SongReaderSettings
          fontSize={settings.fontSize}
          onFontSize={(v) => onSettingsChange({ fontSize: v })}
          transpose={settings.transpose}
          onTranspose={(v) => onSettingsChange({ transpose: v })}
          currentKeyLabel={keyLabel}
          showChords={settings.showChords}
          onShowChords={(v) => onSettingsChange({ showChords: v })}
          scrollSpeed={settings.scrollSpeed}
          onScrollSpeed={(v) => onSettingsChange({ scrollSpeed: v })}
          stageMode={false}
          capo={0}
          onCapo={() => {}}
          showConcertChords={false}
          onShowConcertChords={() => {}}
        />
      </div>

      <div
        ref={bodyRef}
        className="max-h-[60dvh] overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 md:p-4"
      >
        <LyricsWithChords
          text={song.content}
          transposeSemitones={settings.showChords ? settings.transpose : 0}
          chordsVisible={settings.showChords}
          fontSizePx={settings.fontSize}
          className="text-stone-900"
        />
      </div>
    </div>
  );
}
